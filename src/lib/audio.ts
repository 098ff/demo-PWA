// Audio helper supporting default noti.mp3 and custom audio URLs with oscillator fallback

let audioContext: AudioContext | null = null;
let preloadedAudio: HTMLAudioElement | null = null;

// Initialize or unlock Web Audio Context and audio element on user gesture
export function initAudioContext() {
  if (typeof window === 'undefined') return;

  if (!audioContext) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioContext = new AudioCtx();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  // Pre-instantiate and load noti.mp3 on user touch/click
  if (!preloadedAudio) {
    preloadedAudio = new Audio('/noti.mp3');
    preloadedAudio.preload = 'auto';
    preloadedAudio.load();
  }
}

/**
 * Play alert sound.
 * Defaults to /noti.mp3.
 * If customUrl is provided, it attempts to play that custom audio file.
 * If playback fails, it falls back to a synthesized Web Audio alert tone.
 */
export async function playBeepSound(customUrl?: string) {
  initAudioContext();

  const soundSrc = customUrl && customUrl.trim() !== '' ? customUrl.trim() : '/noti.mp3';

  // 1. Try HTML5 Audio (uses preloaded audio instance for /noti.mp3 for fastest response)
  try {
    let audio: HTMLAudioElement;
    if (soundSrc === '/noti.mp3' && preloadedAudio) {
      audio = preloadedAudio.cloneNode(true) as HTMLAudioElement;
    } else {
      audio = new Audio(soundSrc);
      audio.crossOrigin = 'anonymous';
    }

    await audio.play();
    return;
  } catch (err) {
    console.warn(`Failed to play ${soundSrc}, falling back to Web Audio oscillator:`, err);
  }

  // 2. Fallback: Synthesized High-Intensity Alert Tone
  if (!audioContext) return;

  try {
    const ctx = audioContext;
    const now = ctx.currentTime;

    for (let i = 0; i < 3; i++) {
      const startTime = now + i * 0.25;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, startTime);
      osc.frequency.exponentialRampToValueAtTime(1320, startTime + 0.18);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.8, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.22);
    }
  } catch (err) {
    console.error('Failed to synthesize fallback alert:', err);
  }
}
