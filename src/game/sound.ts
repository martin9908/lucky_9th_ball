/**
 * Tiny Web Audio synth — no asset files. All sounds are generated on the fly.
 * The AudioContext is created lazily and resumed on first use (which always
 * follows a user gesture: placing a chip or pressing Spin).
 */

let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

interface BeepOptions {
  freq?: number;
  duration?: number;
  type?: OscillatorType;
  volume?: number;
  /** Schedule the beep this many seconds into the future. */
  delay?: number;
}

export function beep({
  freq = 440,
  duration = 0.08,
  type = "square",
  volume = 0.15,
  delay = 0,
}: BeepOptions = {}): void {
  if (muted) return;
  const ac = getCtx();
  if (!ac) return;

  const start = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;

  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Soft click for placing/removing a chip. */
export function chipBeep(): void {
  beep({ freq: 660, duration: 0.05, type: "square", volume: 0.1 });
}

/** Rising two-tone beep when a spin begins. */
export function spinStartBeep(): void {
  beep({ freq: 520, duration: 0.07, type: "square", volume: 0.14 });
  beep({ freq: 780, duration: 0.09, type: "square", volume: 0.14, delay: 0.07 });
}

/** A single click as the light-chase selector advances one ball. */
export function chaseTick(): void {
  beep({ freq: 1400, duration: 0.016, type: "square", volume: 0.05 });
}

/** Cheerful arpeggio on a win. */
export function winSound(): void {
  beep({ freq: 660, duration: 0.1, type: "triangle", volume: 0.16 });
  beep({ freq: 880, duration: 0.1, type: "triangle", volume: 0.16, delay: 0.1 });
  beep({ freq: 1320, duration: 0.16, type: "triangle", volume: 0.16, delay: 0.2 });
}

/** Flat low beep when nothing matched. */
export function loseSound(): void {
  beep({ freq: 200, duration: 0.18, type: "sawtooth", volume: 0.12 });
}

/**
 * The "9th ball" — a crisp cue-ball-strikes-object-ball crack. A sharp,
 * fast-decaying noise burst (the contact) plus two high tonal pings (the
 * resonant click of two hard balls).
 */
export function cueBallHit(): void {
  if (muted) return;
  const ac = getCtx();
  if (!ac) return;

  const now = ac.currentTime;

  // Contact transient: white noise with a very sharp exponential decay,
  // shaped by a bandpass to give it that hard "clack" timbre.
  const dur = 0.14;
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const decay = Math.pow(1 - i / data.length, 9);
    data[i] = (Math.random() * 2 - 1) * decay;
  }
  const noise = ac.createBufferSource();
  noise.buffer = buffer;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2700;
  bp.Q.value = 1.1;
  const noiseGain = ac.createGain();
  noiseGain.gain.value = 0.85;
  noise.connect(bp).connect(noiseGain).connect(ac.destination);
  noise.start(now);

  // Two stacked pings, the second slightly later — cue ball, then object ball.
  const ping = (freq: number, offset: number, volume: number) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.07);
    osc.connect(gain).connect(ac.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.09);
  };
  ping(1850, 0, 0.3);
  ping(2500, 0.014, 0.22);
}
