const AUDIO_DURATION = 95, FADE = 15, FADE_OUT_START = 80;
export const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let audioUnlocked = false;
let backgroundAudioElement;
let knockBuffers = [], uiHoverBuffer = null, tvStaticLoopBuffer = null, primaryKnockBuffer = null;
let knockTimeoutId = null, knockingActive = false;

async function loadSound(url){
  try { const r=await fetch(url); const b=await r.arrayBuffer(); return await audioCtx.decodeAudioData(b); } catch(e){ console.error('Failed sound', url, e); return null; }
}
export async function loadAllSounds(){
  const urls = ['knock.mp3','knock_2.mp3','knock_3.mp3','knock_4.mp3'];
  knockBuffers = (await Promise.all(urls.map(loadSound))).filter(Boolean);
  uiHoverBuffer = await loadSound('ui_hover.mp3');
  tvStaticLoopBuffer = await loadSound('tv_static_loop.mp3');
  primaryKnockBuffer = await loadSound('knock.mp3');
}
export async function unlockAudio(){
  if (audioUnlocked) return; if (audioCtx.state === 'suspended') await audioCtx.resume(); audioUnlocked = true;
}
export function setupBackgroundAudio(){
  if (backgroundAudioElement) return;
  const audio = new Audio('Fleshy Decay - Sonauto.ai.ogg'); backgroundAudioElement = audio; audio.loop=false; audio.preload='auto';
  const src = audioCtx.createMediaElementSource(audio); const gain = audioCtx.createGain(); gain.gain.value=0; src.connect(gain).connect(audioCtx.destination);
  const apply=()=>{ const t=audio.currentTime; let g=1; if(t<FADE) g=t/FADE; else if(t>=FADE_OUT_START) g=Math.max(0,(AUDIO_DURATION-t)/FADE); gain.gain.setTargetAtTime(g, audioCtx.currentTime, 0.05); };
  audio.addEventListener('timeupdate', apply); audio.addEventListener('seeked', apply); audio.addEventListener('ended', ()=>{ audio.currentTime=0; audio.play(); });
  audio.play().catch(e=>console.error('BG play failed', e));
}
export function playSound(buffer, volume=1.0, onEnded=null, loop=false, fadeInDuration=0){
  if (!audioUnlocked || !buffer) return null;
  try {
    const source = audioCtx.createBufferSource(); source.buffer = buffer; source.loop = loop;
    const gainNode = audioCtx.createGain(); if (fadeInDuration>0){ gainNode.gain.setValueAtTime(0, audioCtx.currentTime); gainNode.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + fadeInDuration); } else { gainNode.gain.value = volume; }
    source.connect(gainNode); gainNode.connect(audioCtx.destination); source.start(0);
    if (onEnded && !loop) source.addEventListener('ended', onEnded, { once:true });
    return { source, gainNode };
  } catch(e){ console.error('Could not play sound', e); return null; }
}
export function scheduleNextKnock(){
  knockingActive = true; const randomInterval = Math.random()*(10000-3000)+3000;
  knockTimeoutId = setTimeout(()=>{ if(!knockingActive) return; if(knockBuffers.length){ playSound(knockBuffers[Math.floor(Math.random()*knockBuffers.length)]); } scheduleNextKnock(); }, randomInterval);
}
export function stopKnocks(){ knockingActive=false; if(knockTimeoutId){ clearTimeout(knockTimeoutId); knockTimeoutId=null; } }
export function playPrimaryKnock(){ if(primaryKnockBuffer) playSound(primaryKnockBuffer, 1.0); }
export function getUIBuffers(){ return { uiHoverBuffer, tvStaticLoopBuffer }; }
export function getBackgroundAudio(){ return backgroundAudioElement; }