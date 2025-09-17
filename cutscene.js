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
    image: 'cutscene_gate.png', // Preloaded but not used on canvas
    gif: 'cutscene_gate.gif',
    duration: 18000, // Longer, more pensive scene
    animationClass: 'gate-zoom',
    onStart: () => {
      // Logic is handled inside transitionToScene
    },
    onEnd: () => {
      // Logic is handled inside transitionToScene
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
  const gifEl = document.getElementById('cutscene-gif');
  csElement.removeEventListener('click', skipCurrentScene);
  if (autoSkipTimeout) clearTimeout(autoSkipTimeout);
  
  const prevScene = scenes[currentSceneIndex];
  const isExitingScene2 = currentSceneIndex === 1;

  // Fade out current scene.
  if (prevScene) {
      if (prevScene.gif) {
          gifEl.className = ''; // Fades out the GIF
      } else {
          canvas.className = ''; // Fades out the canvas
      }
  }

  // For scenes other than scene 2, stop animations before fading.
  if (!isExitingScene2 && currentSceneIndex >= 0) {
    if (zoomRafId) {
        cancelAnimationFrame(zoomRafId);
        zoomRafId = null;
    }
    if (scenes[currentSceneIndex].onEnd) {
        scenes[currentSceneIndex].onEnd();
    }
  }
  
  await new Promise(r => setTimeout(r, 2000)); // Wait for fade-out
  
  // Now that the screen is black, stop scene 2's zoom and run its cleanup.
  if (isExitingScene2) {
    if (zoomRafId) {
        cancelAnimationFrame(zoomRafId);
        zoomRafId = null;
    }
    if (prevScene && prevScene.onEnd) {
        prevScene.onEnd();
    }
  }

  // Full cleanup of previous scene elements
  if (prevScene) {
      if(prevScene.gif) {
          gifEl.style.display = 'none';
          gifEl.src = '';
      } else {
        if (posterizeInstance) {
            try { posterizeInstance.cleanup(); } catch {}
            posterizeInstance = null;
        }
      }
  }
  
  const flockContainer = document.getElementById('bird-flock');
  if (flockContainer && currentSceneIndex === 0) {
      flockContainer.innerHTML = '';
  }

  currentSceneIndex = sceneIndex;
  const scene = scenes[currentSceneIndex];
  
  if (scene.gif) { // Handle GIF scene
    gifEl.src = scene.gif;
    gifEl.style.display = 'block';
    requestAnimationFrame(() => {
        gifEl.classList.add('reveal');
        if (scene.animationClass) gifEl.classList.add(scene.animationClass);
        if (scene.onStart) scene.onStart(csElement);
    });
  } else { // Handle Canvas scene
    const img = preloadedImages[currentSceneIndex];
    if (!img) {
        console.error(`Scene ${currentSceneIndex + 1} image not preloaded.`);
        isTransitioning = false;
        return;
    }
    posterizeInstance = applyPosterizeToImage(canvas, img, null, 5.0, 0.12);
    requestAnimationFrame(() => {
      canvas.classList.add('reveal');
      if (scene.fadeInClass) canvas.classList.add(scene.fadeInClass);
      if (scene.animationClass) canvas.classList.add(scene.animationClass);
      if (scene.onStart) scene.onStart(csElement, canvas);
    });
  }
  
  if (currentSceneIndex < scenes.length - 1) {
    autoSkipTimeout = setTimeout(skipCurrentScene, scene.duration);
    csElement.addEventListener('click', skipCurrentScene, { once: true });
  }
  isTransitioning = false;
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