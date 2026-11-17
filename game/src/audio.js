// Synthesised sound only: every effect is an oscillator or a noise buffer through the Web
// Audio API, so the game ships no audio files and makes no network request. Nothing here runs
// until the player first presses a key or clicks (the browser's autoplay rule), and every call
// is a no-op when sound is off or the context is missing, which keeps headless screenshots
// silent instead of throwing.
export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;
  let lastShot = 0;

  function ensure() {
    if (context !== null) return context !== null;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      const length = Math.floor(context.sampleRate * 0.5);
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    } catch {
      context = null;
    }
    return context !== null;
  }

  /** Start (or resume) the audio context from a user gesture. */
  function unlock() {
    if (!ensure()) return;
    if (context.state === 'suspended') context.resume().catch(() => {});
  }

  function tone({ type, from, to, seconds, volume, delay = 0 }) {
    if (!ensure() || muted || context.state !== 'running') return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.02);
  }

  function noise({ seconds, volume, cutoff }) {
    if (!ensure() || muted || context.state !== 'running') return;
    const start = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
    source.stop(start + seconds + 0.02);
  }

  return {
    unlock,
    get muted() {
      return muted;
    },
    toggleMuted() {
      muted = !muted;
      return muted;
    },
    shoot() {
      const now = performance.now();
      if (now - lastShot < 50) return;
      lastShot = now;
      tone({ type: 'square', from: 920, to: 420, seconds: 0.07, volume: 0.05 });
    },
    explode(big) {
      noise({ seconds: big ? 0.5 : 0.28, volume: big ? 0.3 : 0.16, cutoff: big ? 900 : 1400 });
      tone({ type: 'sine', from: big ? 140 : 190, to: 40, seconds: big ? 0.45 : 0.25, volume: 0.22 });
    },
    pickup(combo) {
      const base = 520 + Math.min(combo, 24) * 22;
      tone({ type: 'sine', from: base, to: base * 1.5, seconds: 0.09, volume: 0.1 });
    },
    powerup() {
      tone({ type: 'triangle', from: 660, to: 660, seconds: 0.09, volume: 0.12 });
      tone({ type: 'triangle', from: 880, to: 880, seconds: 0.12, volume: 0.12, delay: 0.09 });
    },
    hit() {
      tone({ type: 'sawtooth', from: 170, to: 55, seconds: 0.28, volume: 0.2 });
      noise({ seconds: 0.2, volume: 0.14, cutoff: 700 });
    },
    wave() {
      tone({ type: 'triangle', from: 523, to: 523, seconds: 0.1, volume: 0.11 });
      tone({ type: 'triangle', from: 659, to: 659, seconds: 0.1, volume: 0.11, delay: 0.1 });
      tone({ type: 'triangle', from: 784, to: 784, seconds: 0.16, volume: 0.11, delay: 0.2 });
    },
    win() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((frequency, index) => {
        tone({ type: 'triangle', from: frequency, to: frequency, seconds: 0.22, volume: 0.12, delay: index * 0.13 });
      });
    },
    lose() {
      const notes = [392, 330, 262];
      notes.forEach((frequency, index) => {
        tone({ type: 'sawtooth', from: frequency, to: frequency * 0.94, seconds: 0.24, volume: 0.09, delay: index * 0.16 });
      });
    },
  };
}
