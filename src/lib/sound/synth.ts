/**
 * Small Web Audio instruments. Everything is synthesized, so the game needs no
 * audio files (and no music licences) for its background music and effects.
 */

export interface Kit {
  ctx: AudioContext;
  noise: AudioBuffer;
}

export function createNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function hz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Exponential envelope (exponential ramps can't touch zero). */
function envelope(ctx: AudioContext, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function osc(ctx: AudioContext, type: OscillatorType, freq: number, t: number, stop: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.start(t);
  o.stop(stop);
  return o;
}

function noiseSource({ ctx, noise }: Kit, t: number, stop: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  src.start(t, Math.random() * 0.5);
  src.stop(stop);
  return src;
}

function filter(ctx: AudioContext, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/** Koto-like plucked string. */
export function pluck({ ctx }: Kit, out: AudioNode, t: number, midi: number, vel = 0.25, decay = 0.9) {
  const f = hz(midi);
  const end = t + decay + 0.05;
  const lp = filter(ctx, "lowpass", Math.min(9000, f * 8));
  lp.frequency.setValueAtTime(Math.min(9000, f * 8), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(400, f * 1.5), t + decay);
  const env = envelope(ctx, t, vel, 0.004, decay);
  const overtone = ctx.createGain();
  overtone.gain.value = 0.25;
  osc(ctx, "triangle", f, t, end).connect(lp);
  osc(ctx, "sine", f * 2, t, end).connect(overtone).connect(lp);
  lp.connect(env).connect(out);
}

export function bass({ ctx }: Kit, out: AudioNode, t: number, midi: number, vel = 0.3, decay = 0.35) {
  const end = t + decay + 0.05;
  const lp = filter(ctx, "lowpass", 700);
  const env = envelope(ctx, t, vel, 0.006, decay);
  osc(ctx, "triangle", hz(midi), t, end).connect(lp);
  osc(ctx, "sine", hz(midi), t, end).connect(lp);
  lp.connect(env).connect(out);
}

/** Soft sustained chord. */
export function pad({ ctx }: Kit, out: AudioNode, t: number, chord: number[], duration: number, vel = 0.04) {
  const end = t + duration + 0.1;
  const lp = filter(ctx, "lowpass", 1400);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(vel, t + Math.min(0.4, duration / 3));
  env.gain.setValueAtTime(vel, t + duration * 0.7);
  env.gain.linearRampToValueAtTime(0, t + duration);
  for (const midi of chord) {
    for (const detune of [-7, 7]) {
      const o = osc(ctx, "triangle", hz(midi), t, end);
      o.detune.value = detune;
      o.connect(lp);
    }
  }
  lp.connect(env).connect(out);
}

/** Festival drum: pitched body plus a short skin slap. */
export function taiko(kit: Kit, out: AudioNode, t: number, vel = 0.5) {
  const { ctx } = kit;
  const body = osc(ctx, "sine", 125, t, t + 0.7);
  body.frequency.exponentialRampToValueAtTime(48, t + 0.32);
  body.connect(envelope(ctx, t, vel, 0.003, 0.55)).connect(out);
  noiseSource(kit, t, t + 0.1)
    .connect(filter(ctx, "lowpass", 900))
    .connect(envelope(ctx, t, vel * 0.35, 0.002, 0.06))
    .connect(out);
}

export function kick({ ctx }: Kit, out: AudioNode, t: number, vel = 0.4) {
  const o = osc(ctx, "sine", 150, t, t + 0.3);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  o.connect(envelope(ctx, t, vel, 0.002, 0.22)).connect(out);
}

export function hat(kit: Kit, out: AudioNode, t: number, vel = 0.06, decay = 0.04) {
  noiseSource(kit, t, t + decay + 0.05)
    .connect(filter(kit.ctx, "highpass", 7000))
    .connect(envelope(kit.ctx, t, vel, 0.001, decay))
    .connect(out);
}

export function shaker(kit: Kit, out: AudioNode, t: number, vel = 0.05) {
  noiseSource(kit, t, t + 0.12)
    .connect(filter(kit.ctx, "bandpass", 6000, 1.2))
    .connect(envelope(kit.ctx, t, vel, 0.012, 0.07))
    .connect(out);
}

/** Clock tick / "ka" rim hit. */
export function woodblock({ ctx }: Kit, out: AudioNode, t: number, freq = 900, vel = 0.35) {
  const env = envelope(ctx, t, vel, 0.001, 0.07);
  const ring = ctx.createGain();
  ring.gain.value = 0.3;
  osc(ctx, "sine", freq, t, t + 0.12).connect(env);
  osc(ctx, "triangle", freq * 2.7, t, t + 0.12).connect(ring).connect(env);
  env.connect(out);
}

/** Temple bell: inharmonic partials with long, staggered decays. */
export function bell({ ctx }: Kit, out: AudioNode, t: number, f0: number, vel = 0.4, decay = 2.4) {
  const partials: [ratio: number, gain: number, decay: number][] = [
    [1, 1, 1],
    [2, 0.5, 0.7],
    [2.76, 0.35, 0.5],
    [5.4, 0.15, 0.3],
  ];
  for (const [ratio, gain, d] of partials) {
    osc(ctx, "sine", f0 * ratio, t, t + decay * d + 0.1).connect(envelope(ctx, t, vel * gain, 0.005, decay * d)).connect(out);
  }
}

/** Brassy note for the fanfare. */
export function brass({ ctx }: Kit, out: AudioNode, t: number, midi: number, duration: number, vel = 0.12) {
  const end = t + duration + 0.25;
  const lp = filter(ctx, "lowpass", 600, 1.5);
  lp.frequency.setValueAtTime(600, t);
  lp.frequency.exponentialRampToValueAtTime(2600, t + 0.06);
  lp.frequency.exponentialRampToValueAtTime(1400, t + duration);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(vel, t + 0.03);
  env.gain.setValueAtTime(vel, t + duration);
  env.gain.linearRampToValueAtTime(0, t + duration + 0.2);
  for (const detune of [-6, 6]) {
    const o = osc(ctx, "sawtooth", hz(midi), t, end);
    o.detune.value = detune;
    o.connect(lp);
  }
  lp.connect(env).connect(out);
}

export function whoosh(kit: Kit, out: AudioNode, t: number, duration = 0.45, vel = 0.12) {
  const bp = filter(kit.ctx, "bandpass", 300, 2);
  bp.frequency.setValueAtTime(300, t);
  bp.frequency.exponentialRampToValueAtTime(3200, t + duration);
  const env = kit.ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(vel, t + duration * 0.7);
  env.gain.linearRampToValueAtTime(0, t + duration);
  noiseSource(kit, t, t + duration + 0.05).connect(bp).connect(env).connect(out);
}

export function cymbal(kit: Kit, out: AudioNode, t: number, vel = 0.12, decay = 1.4) {
  noiseSource(kit, t, t + decay + 0.1)
    .connect(filter(kit.ctx, "highpass", 5000))
    .connect(envelope(kit.ctx, t, vel, 0.004, decay))
    .connect(out);
}
