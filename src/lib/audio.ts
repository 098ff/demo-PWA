// Audio helper using Web Audio API AudioBuffer for reliable playback (noti.mp3)

let audioContext: AudioContext | null = null;
let notiAudioBuffer: AudioBuffer | null = null;
let isBufferLoading = false;

// Get or initialize the AudioContext
export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioContext = new AudioCtx();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

// Load and decode noti.mp3 into memory for instant, autoplay-safe Web Audio playback
export async function loadNotiAudioBuffer(): Promise<AudioBuffer | null> {
  if (notiAudioBuffer) return notiAudioBuffer;
  if (isBufferLoading) return null;

  const ctx = getAudioContext();
  if (!ctx) return null;

  try {
    isBufferLoading = true;
    const response = await fetch('/sounds/noti.mp3');
    if (!response.ok) {
      throw new Error(`Failed to fetch /sounds/noti.mp3: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    // decodeAudioData works asynchronously and attaches to the unlocked AudioContext
    notiAudioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
      ctx.decodeAudioData(arrayBuffer, resolve, reject);
    });
    console.log('✅ noti.mp3 loaded and decoded successfully into Web Audio Buffer');
    return notiAudioBuffer;
  } catch (err) {
    console.error('Failed to decode noti.mp3 buffer:', err);
    return null;
  } finally {
    isBufferLoading = false;
  }
}

// Initialize audio context and trigger buffer preload on user gesture (Join or Click)
export function initAudioContext() {
  getAudioContext();
  loadNotiAudioBuffer();
}

/**
 * Play alert sound.
 * Priority 1: Web Audio Buffer (plays noti.mp3 via unlocked AudioContext without Autoplay restrictions)
 * Priority 2: Custom URL via HTML5 Audio (if a specific storage URL is passed)
 * Priority 3: Direct HTML5 Audio fallback for /sounds/noti.mp3
 */
export async function playBeepSound(customUrl?: string) {
  const ctx = getAudioContext();

  const isDefaultNoti =
    !customUrl ||
    customUrl.trim() === '' ||
    customUrl === '/noti.mp3' ||
    customUrl === '/sounds/noti.mp3';

  // 1. Play noti.mp3 directly through Web Audio Buffer
  if (isDefaultNoti && ctx) {
    let buffer = notiAudioBuffer;
    if (!buffer) {
      buffer = await loadNotiAudioBuffer();
    }

    if (buffer) {
      try {
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;

        // Add a master gain for clear volume
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(1.0, ctx.currentTime);

        source.connect(gainNode);
        gainNode.connect(ctx.destination);

        source.start(0);
        console.log('🔊 Playing noti.mp3 via Web Audio Buffer');
        return;
      } catch (err) {
        console.warn('Web Audio buffer playback failed, trying HTML5 Audio:', err);
      }
    }
  }

  // 2. Play custom URL or fallback via HTML5 Audio
  const targetSound = customUrl && customUrl.trim() !== '' ? customUrl.trim() : '/sounds/noti.mp3';

  try {
    const audio = new Audio(targetSound);
    audio.crossOrigin = 'anonymous';
    await audio.play();
    console.log('🔊 Playing sound via HTML5 Audio:', targetSound);
    return;
  } catch (err) {
    console.error('HTML5 Audio play failed:', err);
  }

  // 3. Last-ditch fallback: if AudioBuffer hasn't finished loading yet, try one more time
  if (ctx && !notiAudioBuffer) {
    const buf = await loadNotiAudioBuffer();
    if (buf) {
      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.connect(ctx.destination);
      source.start(0);
    }
  }
}
