// Audio helper supporting both synthesized beep and custom storage audio URLs

let audioContext: AudioContext | null = null;

// Initialize or unlock Web Audio Context on user gesture
export function initAudioContext() {
  if (typeof window === 'undefined') return;
  if (!audioContext) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioContext = new AudioCtx();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

/**
 * Play alert sound.
 * If customUrl is provided, it attempts to play the custom audio file from your cloud storage.
 * If customUrl is empty or fails, it falls back to a loud synthesized Web Audio alert beep.
 */
export async function playBeepSound(customUrl?: string) {
  initAudioContext();

  // 1. Try playing custom sound from your storage (if URL provided)
  if (customUrl && customUrl.trim() !== '') {
    try {
      const audio = new Audio(customUrl.trim());
      audio.crossOrigin = 'anonymous';
      await audio.play();
      return;
    } catch (err) {
      console.warn('Could not play custom audio URL, falling back to Web Audio oscillator:', err);
    }
  }

  // 2. Synthesized High-Intensity Dual Beep (No external files needed)
  if (!audioContext) return;

  try {
    const ctx = audioContext;
    const now = ctx.currentTime;

    // Create 3 rapid beep pulses
    for (let i = 0; i < 3; i++) {
      const startTime = now + i * 0.25;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // High pitch 880Hz (A5) alert tone
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, startTime);
      osc.frequency.exponentialRampToValueAtTime(1320, startTime + 0.18);

      // Volume envelope
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.8, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.22);
    }
  } catch (err) {
    console.error('Failed to synthesize beep:', err);
  }
}
