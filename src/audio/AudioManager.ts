import { clamp } from '../utils/math';

type MuteListener = (muted: boolean) => void;
type Phase = 'menu' | 'countdown' | 'playing' | 'paused' | 'crashed' | 'finished' | 'gameover';

/**
 * Tiny procedural sound engine. There are no audio files: the sea, wind,
 * bicycle ticks, UI blips and event stings are all synthesised with Web Audio.
 * The context is created only after a user gesture, so browsers never block us.
 */
export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private noiseBuffer: AudioBuffer | null = null;
  private unlockAttempted = false;
  private pedalTravel = 0;
  private muted: boolean;
  private readonly listeners = new Set<MuteListener>();

  constructor() {
    this.muted = readStoredMuted();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get isUnlocked(): boolean {
    return this.context !== null;
  }

  onMuteChange(listener: MuteListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  bindGestureUnlock(): void {
    const unlock = (): void => this.unlock();
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });
  }

  setMuted(muted: boolean, persist = true): void {
    this.muted = muted;
    if (persist) writeStoredMuted(muted);
    if (this.master && this.context) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(muted ? 0 : 0.34, now, 0.03);
    }
    for (const listener of this.listeners) listener(muted);
  }

  toggleMuted(): boolean {
    const next = !this.muted;
    this.setMuted(next);
    if (!next) {
      this.unlock();
      this.uiClick();
    }
    return next;
  }

  unlock(): void {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume();
      return;
    }
    if (this.unlockAttempted) return;
    this.unlockAttempted = true;
    try {
      const AudioContextCtor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      const context = new AudioContextCtor({ latencyHint: 'interactive' });
      this.context = context;
      this.master = context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.34;
      this.master.connect(context.destination);
      this.noiseBuffer = this.createNoiseBuffer(2.2);
      this.startAmbience();
      if (context.state === 'suspended') void context.resume();
    } catch {
      // Audio is a garnish; a blocked/unsupported context must never stop play.
      this.context = null;
      this.master = null;
    }
  }

  update(dt: number, speed: number, grounded: boolean, phase: Phase): void {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const speedT = clamp(speed / 16.2, 0, 1);
    const quiet = phase === 'paused' || phase === 'menu';
    this.ambienceGain?.gain.setTargetAtTime(quiet ? 0.018 : 0.031, now, 0.2);
    this.windGain?.gain.setTargetAtTime(0.0025 + speedT * 0.011, now, 0.25);

    if ((phase === 'playing' || phase === 'countdown') && grounded && speed > 0.4) {
      this.pedalTravel += Math.abs(speed) * dt;
      if (this.pedalTravel >= 1.65) {
        this.pedalTravel %= 1.65;
        this.pedalTick();
      }
    } else if (phase === 'menu') {
      this.pedalTravel = 0;
    }
  }

  uiClick(): void {
    this.tone(560, 0.045, 'triangle', 0.055);
  }

  countdown(digit: number): void {
    this.tone(digit > 0 ? 660 : 880, 0.075, 'sine', 0.065);
  }

  go(): void {
    this.tone(660, 0.1, 'sine', 0.07);
    this.tone(990, 0.22, 'sine', 0.07, 0.08);
  }

  fish(combo: number): void {
    const base = combo > 2 ? 1100 : 880;
    this.tone(base, 0.11, 'sine', 0.072);
    this.tone(base * 1.5, 0.16, 'sine', 0.045, 0.06);
    if (combo >= 3) this.tone(base * 2, 0.12, 'triangle', 0.035, 0.13);
  }

  jump(): void {
    this.tone(240, 0.18, 'triangle', 0.055, 0, 520);
    this.noiseBurst(0.09, 900, 0.02, 'highpass');
  }

  land(): void {
    this.tone(92, 0.15, 'sine', 0.09, 0, 58);
    this.noiseBurst(0.13, 360, 0.045, 'lowpass');
  }

  crash(): void {
    this.noiseBurst(0.24, 460, 0.16, 'lowpass');
    this.tone(84, 0.3, 'sawtooth', 0.075, 0, 42);
  }

  checkpoint(): void {
    this.tone(523, 0.12, 'sine', 0.06);
    this.tone(659, 0.14, 'sine', 0.05, 0.09);
    this.tone(784, 0.22, 'sine', 0.042, 0.18);
  }

  finish(): void {
    const notes = [523, 659, 784, 1046];
    notes.forEach((note, index) => {
      this.tone(note, 0.2, 'triangle', 0.06, index * 0.11);
    });
    this.noiseBurst(0.4, 1200, 0.025, 'highpass', 0.25);
  }

  gameOver(): void {
    this.tone(392, 0.2, 'sine', 0.055);
    this.tone(294, 0.24, 'sine', 0.05, 0.12);
    this.tone(196, 0.4, 'sine', 0.045, 0.24);
  }

  dispose(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.sources.length = 0;
    this.listeners.clear();
    if (this.context) void this.context.close();
    this.context = null;
    this.master = null;
  }

  private startAmbience(): void {
    const context = this.context;
    const master = this.master;
    const buffer = this.noiseBuffer;
    if (!context || !master || !buffer) return;

    const sea = context.createBufferSource();
    sea.buffer = buffer;
    sea.loop = true;
    const seaFilter = context.createBiquadFilter();
    seaFilter.type = 'lowpass';
    seaFilter.frequency.value = 520;
    seaFilter.Q.value = 0.6;
    this.ambienceGain = context.createGain();
    this.ambienceGain.gain.value = 0.03;
    sea.connect(seaFilter).connect(this.ambienceGain).connect(master);
    sea.start();
    this.sources.push(sea);

    const swell = context.createOscillator();
    const swellGain = context.createGain();
    swell.frequency.value = 0.13;
    swellGain.gain.value = 0.012;
    swell.connect(swellGain).connect(this.ambienceGain.gain);
    swell.start();
    this.sources.push(swell);

    const wind = context.createBufferSource();
    wind.buffer = buffer;
    wind.loop = true;
    const windFilter = context.createBiquadFilter();
    windFilter.type = 'highpass';
    windFilter.frequency.value = 760;
    windFilter.Q.value = 0.3;
    this.windGain = context.createGain();
    this.windGain.gain.value = 0.003;
    wind.connect(windFilter).connect(this.windGain).connect(master);
    wind.start();
    this.sources.push(wind);
  }

  private pedalTick(): void {
    this.noiseBurst(0.028, 2200, 0.012, 'highpass');
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
    endFrequency?: number,
  ): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || this.muted) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), start);
    if (endFrequency !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(20, endFrequency),
        start + duration,
      );
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  private noiseBurst(
    duration: number,
    frequency: number,
    volume: number,
    type: BiquadFilterType,
    delay = 0,
  ): void {
    const context = this.context;
    const master = this.master;
    const buffer = this.noiseBuffer;
    if (!context || !master || !buffer || this.muted) return;
    const start = context.currentTime + delay;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = Math.max(80, frequency);
    filter.Q.value = 0.7;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  private createNoiseBuffer(seconds: number): AudioBuffer {
    const context = this.context;
    if (!context) throw new Error('Audio context unavailable');
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.965 + white * 0.035;
      data[i] = last * 4.2 + white * 0.22;
    }
    return buffer;
  }
}

const STORAGE_KEY = 'pelican-rider.muted.v1';

function readStoredMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStoredMuted(muted: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  } catch {
    // Private mode / disabled storage: keep the in-memory setting.
  }
}

export const gameAudio = new AudioManager();
