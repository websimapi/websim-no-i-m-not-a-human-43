import { applyPosterizeToImage } from './posterize.js';
import { audioCtx, getBackgroundAudio } from './audio.js';
import { animateBirds, stopBirds } from './birds.js';

const scenes = [
  { // Scene 1: Landscape with birds
    image: 'cutscene_landscape.png',
    duration: 14000,
    fadeInClass: 'fade-in-long',
    onStart: (cs, canvas) => {
      if (posterizeInstance) posterizeInstance.setFogCoverage(0.45); // Set sky mask for cloud effect
      animateBirds(() => {
        // This onComplete might trigger a transition if the scene hasn't already.
        if (currentSceneIndex === 0) {
          transitionToScene(1);
        }
      });
    },
    onEnd: () => {
      stopBirds(false);
    }
  },
  { // Scene 2: Driving on the road
    image: 'cutscene_roadside.png',
    duration: 14000,
    animationClass: 'drive-zoom',
    onStart: (cs, canvas) => {
      const canvasWrapper = document.getElementById('cutscene-canvas-wrapper');
      let scale = 1.0;
      let lastTime = performance.now();
      const zoomSpeed = 0.1;
      const fogStartTime = performance.now();
      const fogDuration = 30000;

      function zoomLoop(currentTime) {
        if (currentSceneIndex !== 1) return; // Stop loop if scene changed
        const deltaTime = (currentTime - lastTime) / 1000;
        lastTime = currentTime;
        scale += zoomSpeed * deltaTime;
        if (canvasWrapper) canvasWrapper.style.transform = `scale(${scale})`;

        const fogElapsed = currentTime - fogStartTime;
        const fogProgress = Math.min(1.0, fogElapsed / fogDuration);
        const currentFogCoverage = 0.45 + (1.5 - 0.45) * fogProgress;
        if (posterizeInstance) posterizeInstance.setFogCoverage(currentFogCoverage);

        zoomRafId = requestAnimationFrame(zoomLoop);
      }
      zoomRafId = requestAnimationFrame(zoomLoop);
    },
    onEnd: () => {
      const canvasWrapper = document.getElementById('cutscene-canvas-wrapper');
      if (canvasWrapper) canvasWrapper.style.transform = `scale(1)`;
    }
  },
  { // Scene 3: The Green Gate
    image: 'cutscene_gate.png',
    duration: 18000, // Longer, more pensive scene
    animationClass: 'gate-zoom',
    onStart: (cs, canvas) => {
      // For now, it's just a CSS zoom. We can add shader effects here.
      if (posterizeInstance) posterizeInstance.setFogCoverage(0.0); // No fog
    },
    onEnd: () => {
      // This is the last scene for now. It could fade to black or loop.
    }
  }
];

let currentSceneIndex = -1;
let posterizeInstance = null;
let autoSkipTimeout = null;
let zoomRafId = null;
let isTransitioning = false;
let csElement = null;
let preloadedImages = [];

const skipCurrentScene = () => {
  if (currentSceneIndex < scenes.length - 1) {
    transitionToScene(currentSceneIndex + 1);
  }
};

async function transitionToScene(sceneIndex) {
  if (isTransitioning || sceneIndex === currentSceneIndex) return;
  isTransitioning = true;

  const canvas = document.getElementById('cutscene-canvas');
  csElement.removeEventListener('click', skipCurrentScene);
  if (autoSkipTimeout) clearTimeout(autoSkipTimeout);
  
  const isExitingScene2 = currentSceneIndex === 1;

  // For scenes other than scene 2, stop animations before fading.
  if (!isExitingScene2) {
    if (zoomRafId) {
        cancelAnimationFrame(zoomRafId);
        zoomRafId = null;
    }
    if (currentSceneIndex >= 0 && scenes[currentSceneIndex].onEnd) {
        scenes[currentSceneIndex].onEnd();
    }
  }
  
  // Fade out current scene. For scene 2, zoom continues during this fade.
  canvas.className = ''; // Clear all classes to trigger fade-out
  await new Promise(r => setTimeout(r, 2000));
  
  // Now that the screen is black, stop scene 2's zoom and run its cleanup.
  if (isExitingScene2) {
    if (zoomRafId) {
        cancelAnimationFrame(zoomRafId);
        zoomRafId = null;
    }
    if (currentSceneIndex >= 0 && scenes[currentSceneIndex].onEnd) {
        scenes[currentSceneIndex].onEnd();
    }
  }

  const flockContainer = document.getElementById('bird-flock');
  if (flockContainer && currentSceneIndex === 0) {
      flockContainer.innerHTML = '';
  }

  if (posterizeInstance) {
    try { posterizeInstance.cleanup(); } catch {}
    posterizeInstance = null;
  }
  
  currentSceneIndex = sceneIndex;
  const scene = scenes[currentSceneIndex];
  
  const img = preloadedImages[currentSceneIndex];
  if (!img) {
      console.error(`Scene ${currentSceneIndex + 1} image not preloaded.`);
      isTransitioning = false;
      return;
  }

  let overlaySource = null;
  if (currentSceneIndex === 2) { // Scene 3: The Gate
      const video = document.getElementById('gate-gif-video');
      if (video) {
          try {
              await video.play();
              overlaySource = video;
          } catch (e) {
              console.error("Could not play gate gif video:", e);
          }
      }
  }

  posterizeInstance = applyPosterizeToImage(canvas, img, overlaySource, 5.0, 0.12);

  requestAnimationFrame(() => {
    canvas.classList.add('reveal');
    if (scene.fadeInClass) canvas.classList.add(scene.fadeInClass);
    if (scene.animationClass) canvas.classList.add(scene.animationClass);
    
    if (scene.onStart) {
      scene.onStart(csElement, canvas);
    }

    if (currentSceneIndex < scenes.length - 1) {
      autoSkipTimeout = setTimeout(skipCurrentScene, scene.duration);
      csElement.addEventListener('click', skipCurrentScene, { once: true });
    }
    isTransitioning = false;
  });
}

async function preloadCutsceneAssets() {
  const promises = scenes.map(scene => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(`Failed to load ${scene.image}: ${err}`);
      img.src = scene.image;
    });
  });
  return Promise.all(promises);
}

export async function startCutscene(){
  csElement = document.getElementById('cutscene');
  const loading = csElement.querySelector('.cutscene-loading');
  csElement.style.display = 'flex';
  loading.style.display = 'grid';
  
  try {
    preloadedImages = await preloadCutsceneAssets();
  } catch (error) {
    console.error("Failed to preload cutscene assets:", error);
    loading.style.display = 'none'; // Hide loader on error too
    // Maybe show an error message to the user
    return;
  }
  loading.style.display = 'none';
  
  const bg = getBackgroundAudio();
  if (bg) { try { bg.pause(); } catch(e){} }
  
  const cutsceneAudio = new Audio('Distant Transmission - Sonauto.ai.ogg');
  const src = audioCtx.createMediaElementSource(cutsceneAudio);
  const g = audioCtx.createGain();
  g.gain.value = 0;
  src.connect(g).connect(audioCtx.destination);
  await audioCtx.resume();
  await cutsceneAudio.play().catch(()=>{});
  g.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 7);
  setTimeout(() => {
    g.gain.cancelScheduledValues(audioCtx.currentTime);
    g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 7);
  }, (115 - 7) * 1000);

  currentSceneIndex = -1;
  isTransitioning = false;
  transitionToScene(0);
}