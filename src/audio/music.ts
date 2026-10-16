// Music engine: a lookahead scheduler over the generators in score.ts, voiced as a small synthesizer band in a long dark
// room. Every tonal voice reads one shared pitch drift, so the band wobbles together like tape.
// Safe to import in Node: nothing touches Web Audio until audio.ts reports a live context.
import { audioContext, audioMaster, isMuted, onAudioReady } from './audio.ts';
import { Rng, STINGERS, TRACKS, hash, vary, wrong } from './score.ts';
import type { Ctx, Ev, Section, TrackDef, Voice } from './score.ts';

export type TrackId =
  | 'title' | 'map1' | 'map2' | 'map3' | 'battle' | 'elite' | 'boss_tutorial' | 'boss_copycat' | 'boss_ybf'
  | 'rest' | 'shop' | 'event' | 'gameover' | 'victory';
export type StingerId = 'win' | 'lose' | 'candle' | 'coin' | 'relic' | 'blessed';

/** A scheduled note: the score event plus absolute start and length in seconds. */
export interface Note extends Ev { at: number; dur: number }

export interface Rendered { name: string; start: number; secs: number; bpm: number; tag?: string; notes: Note[] }

/** Voices that play one note at a time. The leads glide between notes that touch. */
const MONO: ReadonlySet<Voice> = new Set<Voice>(['lead', 'cold', 'bass', 'sub']);
/** The most notes each polyphonic voice holds at once, which also bounds the cost of a section. */
export const POLY: Record<Voice, number> = { lead: 1, cold: 1, bass: 1, sub: 1, bell: 4, glass: 4, arp: 3, blip: 3, drone: 2, pad: 6, brass: 6, choir: 5, nz: 4 };

function bandsOverlap(a: Ev, b: Ev): boolean {
  return Math.max(a.lay ?? 0, b.lay ?? 0) < Math.min(a.top ?? 2, b.top ?? 2);
}

/** Enforces the band's limits: one note at a time on each mono voice, a cap on the others, nothing past the section end. */
export function normalize(sec: Section): Ev[] {
  const ev = sec.ev
    .filter((e) => e.t >= -1e-6 && e.t < sec.beats - 1e-6 && e.d > 0 && e.g > 0 && Number.isFinite(e.n) && Number.isFinite(e.t))
    .map((e) => ({ ...e, t: Math.max(0, e.t) }))
    .sort((a, b) => a.t - b.t);
  const byVoice = new Map<Voice, Ev[]>();
  for (const e of ev) { const l = byVoice.get(e.v); if (l) l.push(e); else byVoice.set(e.v, [e]); }
  const dead = new Set<Ev>();
  for (const [v, list] of byVoice) {
    if (MONO.has(v)) {
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (dead.has(a)) continue;
        a.d = Math.min(a.d, sec.beats - a.t);
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          if (dead.has(b)) continue;
          if (b.t >= a.t + a.d) break;
          if (!bandsOverlap(a, b)) continue;
          // Two notes on the same instant: the louder one wins.
          if (b.t - a.t < 0.03) { if (b.g > a.g) { dead.add(a); break; } dead.add(b); continue; }
          a.d = Math.min(a.d, b.t - a.t - 0.01);
          break;
        }
      }
    } else {
      const ringing: Ev[] = [];
      for (const e of list) {
        for (let k = ringing.length - 1; k >= 0; k--) if (ringing[k].t + ringing[k].d <= e.t) ringing.splice(k, 1);
        if (ringing.length >= POLY[v]) {
          ringing.sort((x, y) => x.t + x.d - (y.t + y.d));
          const old = ringing.shift()!;
          old.d = Math.max(0.05, e.t - old.t);
        }
        ringing.push(e);
      }
    }
  }
  return ev.filter((e) => !dead.has(e) && e.d > 0.005);
}

/** Walks one track's section graph and renders each section to timed notes. */
export class Seq {
  readonly def: TrackDef;
  private cur: string | null;
  private pass = 0;
  private visits: Record<string, number> = {};
  private st: Record<string, number> = {};
  private mem: Record<string, number[]> = {};

  readonly id: TrackId;
  private seed: number;
  private env: { int(): number; spells(): number[][] };
  constructor(id: TrackId, seed: number, env: { int(): number; spells(): number[][] }) {
    this.id = id;
    this.seed = seed;
    this.env = env;
    this.def = TRACKS[id];
    this.cur = this.def.start;
  }

  next(start: number): Rendered | null {
    const name = this.cur;
    const def = this.def;
    if (name === null || !def.secs[name]) return null;
    const r = new Rng(this.seed ^ hash(this.id) ^ Math.imul(this.pass + 1, 0x9e3779b1));
    const c: Ctx = { r, pass: this.pass, visit: this.visits[name] ?? 0, int: this.env.int(), spells: this.env.spells(), bpm: def.bpm, st: this.st, mem: this.mem };
    let sec = def.secs[name](c);
    if (!sec.still) {
      sec = vary(sec, r, def.vary ?? 0.5);
      if (r.chance(def.wrong ?? 0.04)) sec = wrong(sec, r);
    }
    const spb = 60 / Math.max(20, sec.bpm || def.bpm);
    const notes: Note[] = normalize(sec).map((e) => ({ ...e, at: start + e.t * spb, dur: e.d * spb }));
    this.visits[name] = c.visit + 1;
    this.pass++;
    let nxt: string | null = null;
    if (def.next) nxt = def.next(name, c);
    else { const opts = def.graph?.[name]; if (opts && opts.length) nxt = r.weighted(opts); }
    this.cur = nxt !== null && def.secs[nxt] ? nxt : null;
    return { name, start, secs: Math.max(0.05, sec.beats * spb), bpm: sec.bpm, tag: sec.tag, notes };
  }
}

/** Renders a track without audio, for tests and offline checks. */
export function renderTrack(id: TrackId, seconds: number, opts: { seed?: number; intensity?: (t: number) => number; spells?: number[][] } = {}): Rendered[] {
  let t = 0;
  const seq = new Seq(id, opts.seed ?? 1, { int: () => opts.intensity?.(t) ?? 0, spells: () => opts.spells ?? [] });
  const out: Rendered[] = [];
  while (t < seconds) {
    const s = seq.next(t);
    if (!s) break;
    out.push(s);
    t += s.secs;
  }
  return out;
}

// ---------------------------------------------------------------- the band

const VOICES: Voice[] = ['lead', 'cold', 'bell', 'glass', 'arp', 'bass', 'sub', 'drone', 'pad', 'brass', 'choir', 'blip', 'nz'];
/** Channel level per voice. Measured with renderOffline so that a voice at g 0.5 sits at a similar loudness to the others. */
const BASE: Record<Voice, number> = { lead: 0.18, cold: 0.143, bell: 0.168, glass: 0.138, arp: 0.357, bass: 0.327, sub: 0.27, drone: 0.366, pad: 0.146, brass: 0.15, choir: 0.07, blip: 0.35, nz: 0.7 };
const PAN: Record<Voice, number> = { lead: -0.08, cold: 0.12, bell: 0.18, glass: -0.2, arp: 0.25, bass: 0, sub: 0, drone: 0, pad: 0, brass: 0, choir: 0, blip: 0.3, nz: 0 };
const VERB: Record<Voice, number> = { lead: 0.35, cold: 0.4, bell: 0.9, glass: 1, arp: 0.35, bass: 0.05, sub: 0, drone: 0.55, pad: 0.55, brass: 0.4, choir: 0.75, blip: 0.5, nz: 0.18 };
const ECHO: Record<Voice, number> = { lead: 0.28, cold: 0.32, bell: 0.45, glass: 0.55, arp: 0.6, bass: 0, sub: 0, drone: 0, pad: 0, brass: 0.1, choir: 0, blip: 0.5, nz: 0.05 };
/** Voices whose channel runs through a soft saturator. */
const DRIVEN: ReadonlySet<Voice> = new Set<Voice>(['lead', 'cold', 'bass']);

interface Kit {
  pulse25: PeriodicWave;
  /** The arpeggio's pulse and saw in one wave. */
  arpWave: PeriodicWave;
  /** The bass's saw, square, and sine in one wave. */
  bassWave: PeriodicWave;
  white: AudioBuffer;
  curve: Float32Array<ArrayBuffer>;
  wob: GainNode;
  /** Dry music, ducked under stingers and speech. */
  bus: GainNode;
  /** Everything ends here: the compressor, then the limiter, then the master. */
  post: AudioNode;
  verbIn: GainNode;
  echoIn: GainNode;
  echoL: DelayNode;
  echoR: DelayNode;
  stingDuck: GainNode;
  talkDuck: GainNode;
}

/** A lead voice kept alive across notes that touch, so they glide instead of attacking again. */
interface Mono {
  end: number;
  eg: GainNode;
  srcs: OscillatorNode[];
  freqs: AudioParam[];
  mults: number[];
  filters: BiquadFilterNode[];
  vib: GainNode;
  cold: boolean;
}

interface Player {
  id: TrackId;
  seq: Seq;
  out: GainNode;
  chans: Record<Voice, AudioNode>;
  nodes: AudioNode[];
  queue: Note[];
  qi: number;
  secEnd: number;
  ended: boolean;
  stopAt: number | null;
  live: Set<AudioScheduledSourceNode>;
  mono: Partial<Record<Voice, Mono>>;
  /** The choir's two formant banks. */
  oo: AudioNode;
  ah: AudioNode;
}

const mtof = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

let kit: Kit | null = null;
let player: Player | null = null;
let stingP: Player | null = null;
const dying: Player[] = [];
let desired: TrackId | null = null;
let intensity = 0;
let spells: number[][] = [];
let talking = false;
let timer: ReturnType<typeof setInterval> | null = null;
let sessionSeed = 1;

/** A wave mixed from a pulse of `duty` at `pulse`, a saw at `saw`, and a sine at `sine`, so one oscillator plays all three. */
function mixWave(ac: BaseAudioContext, duty: number, pulse = 1, saw = 0, sine = 0): PeriodicWave {
  const H = 40, re = new Float32Array(H + 1), im = new Float32Array(H + 1);
  for (let h = 1; h <= H; h++) {
    re[h] = (pulse * Math.sin(Math.PI * h * duty)) / h;
    im[h] = (saw * (h % 2 ? 1 : -1) * 2) / (Math.PI * h);
  }
  im[1] += sine;
  return ac.createPeriodicWave(re, im);
}

/** A long dark room: decorrelated noise in each ear, decaying over rt60 and losing its highs as it fades. */
function roomImpulse(ac: BaseAudioContext, rt60 = 4.6, predelay = 0.025): AudioBuffer {
  const sr = ac.sampleRate, n = Math.round(sr * (rt60 + predelay)), pre = Math.round(sr * predelay);
  const buf = ac.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0;
    let seed = ch ? 0x2f6b1c3d : 0x51ed270b;
    for (let i = pre; i < n; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const x = seed / 2147483648 - 1;
      const t = (i - pre) / sr;
      // The low-pass closes as the tail goes on, so the room darkens as it fades.
      const k = 0.85 * Math.exp(-t / 1.1) + 0.06;
      y += k * (x - y);
      d[i] = y * Math.exp((-6.91 * t) / rt60) * (t < 0.01 ? t / 0.01 : 1);
    }
  }
  return buf;
}

function buildKit(ac: BaseAudioContext, master: AudioNode): Kit {
  const sr = ac.sampleRate;
  const white = ac.createBuffer(1, sr * 2, sr);
  const wd = white.getChannelData(0);
  let seed = 0x1234567;
  for (let i = 0; i < wd.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; wd[i] = seed / 2147483648 - 1; }
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) { const x = (i / (curve.length - 1)) * 2 - 1; curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6); }
  // One shared drift: two slow sines, read by the detune of every tonal oscillator.
  const wob = ac.createGain();
  wob.gain.value = 3;
  for (const [f, g] of [[0.19, 1], [0.061, 0.7]] as const) {
    const o = ac.createOscillator(), og = ac.createGain();
    o.frequency.value = f; og.gain.value = g;
    o.connect(og); og.connect(wob); o.start();
  }
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 1.8; comp.knee.value = 6; comp.attack.value = 0.025; comp.release.value = 0.3;
  const lim = ac.createDynamicsCompressor();
  lim.threshold.value = -3; lim.ratio.value = 20; lim.knee.value = 0; lim.attack.value = 0.002; lim.release.value = 0.12;
  comp.connect(lim); lim.connect(master);
  const talkDuck = ac.createGain();
  const stingDuck = ac.createGain();
  const bus = ac.createGain();
  bus.connect(talkDuck); talkDuck.connect(stingDuck); stingDuck.connect(comp);
  // The room.
  const verbIn = ac.createGain();
  const conv = ac.createConvolver();
  conv.buffer = roomImpulse(ac);
  const verbHp = ac.createBiquadFilter();
  verbHp.type = 'highpass'; verbHp.frequency.value = 160;
  const verbOut = ac.createGain();
  verbOut.gain.value = 0.55;
  verbIn.connect(verbHp); verbHp.connect(conv); conv.connect(verbOut); verbOut.connect(comp);
  // A ping-pong echo a dotted eighth behind, dark and thin so it never muddies the low end.
  const echoIn = ac.createGain();
  const echoL = ac.createDelay(2), echoR = ac.createDelay(2);
  echoL.delayTime.value = 0.45; echoR.delayTime.value = 0.45;
  const eLp = ac.createBiquadFilter(), eHp = ac.createBiquadFilter();
  eLp.type = 'lowpass'; eLp.frequency.value = 3200; eHp.type = 'highpass'; eHp.frequency.value = 220;
  const fbL = ac.createGain(), fbR = ac.createGain();
  fbL.gain.value = 0.38; fbR.gain.value = 0.38;
  const merge = ac.createChannelMerger(2);
  const echoOut = ac.createGain();
  echoOut.gain.value = 0.42;
  echoIn.connect(eHp); eHp.connect(eLp); eLp.connect(echoL);
  echoL.connect(fbL); fbL.connect(echoR); echoR.connect(fbR); fbR.connect(echoL);
  echoL.connect(merge, 0, 0); echoR.connect(merge, 0, 1);
  merge.connect(echoOut); echoOut.connect(comp);
  const echoVerb = ac.createGain();
  echoVerb.gain.value = 0.3;
  echoOut.connect(echoVerb); echoVerb.connect(verbIn);
  return { pulse25: mixWave(ac, 0.25), arpWave: mixWave(ac, 0.3, 1, 0.5), bassWave: mixWave(ac, 0.5, 0.4, 0.6, 0.3), white, curve, wob, bus, post: comp, verbIn, echoIn, echoL, echoR, stingDuck, talkDuck };
}

function makePlayer(ac: BaseAudioContext, k: Kit, id: TrackId, dest: AudioNode, seed?: number): Player {
  const seq = new Seq(id, seed ?? (sessionSeed = (Math.imul(sessionSeed, 1103515245) + 12345 + Date.now()) >>> 0), {
    int: () => intensity,
    spells: () => spells,
  });
  const def = seq.def;
  const out = ac.createGain();
  out.gain.value = def.level ?? 1;
  out.connect(dest);
  const nodes: AudioNode[] = [out];
  const chans = {} as Record<Voice, AudioNode>;
  for (const v of VOICES) {
    const g = ac.createGain();
    g.gain.value = BASE[v] * (def.mix?.[v] ?? 1);
    let tail: AudioNode = g;
    if (v === 'pad') {
      const lp = lowpass(ac, 1700, 0.7);
      tail.connect(lp); tail = lp; nodes.push(lp);
    }
    if (DRIVEN.has(v)) {
      const sh = ac.createWaveShaper();
      sh.curve = k.curve;
      tail.connect(sh); tail = sh; nodes.push(sh);
    }
    const p = ac.createStereoPanner();
    p.pan.value = PAN[v];
    tail.connect(p); tail = p; nodes.push(p);
    tail.connect(out);
    const vs = ac.createGain();
    vs.gain.value = (def.verb ?? 1) * VERB[v];
    tail.connect(vs); vs.connect(k.verbIn); nodes.push(vs);
    if (ECHO[v] > 0) {
      const es = ac.createGain();
      es.gain.value = (def.echo ?? 0.5) * ECHO[v];
      tail.connect(es); es.connect(k.echoIn); nodes.push(es);
    }
    nodes.push(g);
    chans[v] = g;
  }
  const oo = formantBank(ac, VOWELS.oo, chans.choir, nodes);
  const ah = formantBank(ac, VOWELS.ah, chans.choir, nodes);
  return { id, seq, out, chans, nodes, queue: [], qi: 0, secEnd: ac.currentTime + 0.06, ended: false, stopAt: null, live: new Set(), mono: {}, oo, ah };
}

function track(p: Player, src: AudioScheduledSourceNode, extra: AudioNode[], params: AudioParam[], k: Kit) {
  p.live.add(src);
  src.onended = () => {
    p.live.delete(src);
    try { src.disconnect(); } catch { /* ignore */ }
    for (const n of extra) { try { n.disconnect(); } catch { /* ignore */ } }
    for (const a of params) { try { k.wob.disconnect(a); } catch { /* ignore */ } }
  };
}

function osc(ac: BaseAudioContext, k: Kit, kind: OscillatorType | PeriodicWave, f: number, at: number, det = 0): OscillatorNode {
  const o = ac.createOscillator();
  if (kind instanceof PeriodicWave) o.setPeriodicWave(kind); else o.type = kind;
  o.frequency.setValueAtTime(f, at);
  o.detune.value = det;
  k.wob.connect(o.detune);
  return o;
}

function noise(ac: BaseAudioContext, k: Kit): AudioBufferSourceNode {
  const s = ac.createBufferSource();
  s.buffer = k.white;
  s.loop = true;
  return s;
}

function bendTo(p: AudioParam, f: number, at: number, dur: number, semis: number) {
  p.setValueAtTime(f, at + dur * 0.5);
  p.exponentialRampToValueAtTime(f * Math.pow(2, semis / 12), at + dur);
}

/** A held envelope: linear attack to the peak, hold, then an exponential release with time constant `rel`. */
function hold(p: AudioParam, at: number, dur: number, peak: number, a: number, rel: number) {
  p.setValueAtTime(0, at);
  p.linearRampToValueAtTime(peak, at + Math.min(a, Math.max(0.002, dur)));
  p.setTargetAtTime(0, at + dur, rel);
}

function lowpass(ac: BaseAudioContext, f: number, q = 0.7): BiquadFilterNode {
  const b = ac.createBiquadFilter();
  b.type = 'lowpass'; b.frequency.value = f; b.Q.value = q;
  // Cutoff sweeps update once a block rather than every sample, which costs far less and sounds the same.
  try { b.frequency.automationRate = 'k-rate'; } catch { /* older engines keep a-rate */ }
  return b;
}

function leadNote(ac: BaseAudioContext, k: Kit, p: Player, n: Note, ch: AudioNode) {
  const cold = n.v === 'cold';
  const at = n.at, dur = Math.max(0.03, n.dur), g = Math.min(1, n.g);
  const f = mtof(n.n);
  const rel = cold ? 0.05 : 0.08;
  const vibDepth = cold ? 9 : 16, vibDelay = cold ? 0 : 0.33;
  const base = (n.cut ?? (cold ? 2600 : 1700)) * Math.sqrt(f / 440);
  const env = cold ? 0.6 : 1.2;
  const m = p.mono[n.v];
  if (m && at - m.end < 0.03 && at > m.end - 0.5) {
    // Legato: glide every oscillator to the new pitch, keep the level up, and push the release out.
    m.freqs.forEach((fp, i) => { fp.cancelScheduledValues(at); fp.setTargetAtTime(f * m.mults[i], at, 0.03); });
    m.eg.gain.cancelScheduledValues(at);
    m.eg.gain.setTargetAtTime(g, at, 0.006);
    m.eg.gain.setTargetAtTime(0, at + dur, rel);
    for (const fl of m.filters) {
      fl.frequency.cancelScheduledValues(at);
      fl.frequency.setTargetAtTime(base * (1 + env * 0.5), at, 0.01);
      fl.frequency.setTargetAtTime(base, at + 0.02, 0.25);
    }
    m.vib.gain.cancelScheduledValues(at);
    m.vib.gain.setValueAtTime(cold ? vibDepth : 0, at);
    if (!cold) { m.vib.gain.setValueAtTime(0, at + vibDelay); m.vib.gain.linearRampToValueAtTime(vibDepth, at + vibDelay + 0.5); }
    for (const s of m.srcs) s.stop(at + dur + rel * 7);
    m.end = at + dur;
    return;
  }
  const tune = n.det ?? 0;
  const srcs: OscillatorNode[] = [];
  const mults: number[] = [];
  const mix = ac.createGain();
  const add = (o: OscillatorNode, mult: number, level: number) => {
    const lg = ac.createGain();
    lg.gain.value = level;
    o.connect(lg); lg.connect(mix);
    srcs.push(o); mults.push(mult);
  };
  if (cold) {
    add(osc(ac, k, k.pulse25, f, at, tune), 1, 0.8);
    add(osc(ac, k, 'sawtooth', f, at, tune + 3), 1, 0.36);
  } else {
    add(osc(ac, k, 'sawtooth', f, at, tune - 7), 1, 0.5);
    add(osc(ac, k, 'sawtooth', f, at, tune + 7), 1, 0.5);
    add(osc(ac, k, 'square', f / 2, at, tune), 0.5, 0.3);
  }
  if (n.bend) for (const [i, s] of srcs.entries()) bendTo(s.frequency, f * mults[i], at, dur, n.bend);
  const vibO = ac.createOscillator(), vib = ac.createGain();
  vibO.frequency.value = cold ? 7.5 : 5.2;
  vib.gain.setValueAtTime(cold ? vibDepth : 0, at);
  if (!cold) { vib.gain.setValueAtTime(0, at + vibDelay); vib.gain.linearRampToValueAtTime(vibDepth, at + vibDelay + 0.5); }
  vibO.connect(vib);
  for (const s of srcs) vib.connect(s.detune);
  const f1 = lowpass(ac, base, 0.9), f2 = lowpass(ac, base, 0.6);
  for (const fl of [f1, f2]) {
    fl.frequency.setValueAtTime(base * (1 + env), at);
    fl.frequency.setTargetAtTime(base, at + 0.012, 0.25);
  }
  const eg = ac.createGain();
  hold(eg.gain, at, dur, g, cold ? 0.008 : 0.03, rel);
  mix.connect(f1); f1.connect(f2); f2.connect(eg); eg.connect(ch);
  const end = at + dur + rel * 7;
  for (const s of srcs) { s.start(at); s.stop(end); }
  vibO.start(at); vibO.stop(end);
  srcs.forEach((s, i) => track(p, s, i === 0 ? [mix, f1, f2, eg, vib] : [], [s.detune], k));
  track(p, vibO, [], [], k);
  p.mono[n.v] = { end: at + dur, eg, srcs: [...srcs, vibO], freqs: srcs.map((s) => s.frequency), mults, filters: [f1, f2], vib, cold };
}

function bellNote(ac: BaseAudioContext, k: Kit, p: Player, n: Note, ch: AudioNode) {
  const glass = n.v === 'glass';
  const at = n.at, g = Math.min(1, n.g), f = mtof(n.n);
  const ratio = n.ratio ?? (glass ? 3.5 : 2), index = glass ? 2.2 : 1.6, decay = Math.min(glass ? 2.6 : 2, Math.max(0.4, n.dur * 1.5));
  const car = osc(ac, k, 'sine', f, at, n.det ?? 0), mod = osc(ac, k, 'sine', f * ratio, at, n.det ?? 0);
  if (n.bend) { bendTo(car.frequency, f, at, n.dur, n.bend); bendTo(mod.frequency, f * ratio, at, n.dur, n.bend); }
  const mg = ac.createGain(), eg = ac.createGain(), pan = ac.createStereoPanner();
  const dev = index * f * ratio;
  mg.gain.setValueAtTime(dev, at);
  mg.gain.setTargetAtTime(dev * 0.2, at, 0.25);
  mg.gain.setTargetAtTime(0, at + 0.8, decay);
  eg.gain.setValueAtTime(0, at);
  eg.gain.linearRampToValueAtTime(g, at + 0.002);
  eg.gain.setTargetAtTime(0, at + 0.002, decay);
  pan.pan.value = n.pan ?? 0;
  mod.connect(mg); mg.connect(car.frequency); car.connect(eg); eg.connect(pan); pan.connect(ch);
  const end = at + decay * 6;
  car.start(at); mod.start(at); car.stop(end); mod.stop(end);
  track(p, car, [eg, mg, pan], [car.detune], k);
  track(p, mod, [], [mod.detune], k);
}

function arpNote(ac: BaseAudioContext, k: Kit, p: Player, n: Note, ch: AudioNode, blip: boolean) {
  const at = n.at, dur = Math.max(0.02, n.dur), g = Math.min(1, n.g), f = mtof(n.n);
  const eg = ac.createGain(), pan = ac.createStereoPanner();
  pan.pan.value = n.pan ?? 0;
  const dec = blip ? 0.07 : 0.18;
  eg.gain.setValueAtTime(0, at);
  eg.gain.linearRampToValueAtTime(g, at + (blip ? 0.001 : 0.002));
  eg.gain.setTargetAtTime(0, at + 0.002, dec);
  eg.gain.setTargetAtTime(0, at + dur, 0.03);
  const end = at + Math.min(dur + 0.12, dec * 6);
  if (blip) {
    const o = osc(ac, k, 'triangle', f, at, n.det ?? 0);
    o.connect(eg); eg.connect(pan); pan.connect(ch);
    o.start(at); o.stop(end);
    track(p, o, [eg, pan], [o.detune], k);
    return;
  }
  const a = osc(ac, k, k.arpWave, f, at, n.det ?? 0);
  const cut = n.cut ?? 1500;
  const lp = lowpass(ac, cut * 3, 4);
  lp.frequency.setTargetAtTime(cut, at, 0.05);
  a.connect(lp); lp.connect(eg); eg.connect(pan); pan.connect(ch);
  a.start(at); a.stop(end);
  track(p, a, [lp, eg, pan], [a.detune], k);
}

function bassNote(ac: BaseAudioContext, k: Kit, p: Player, n: Note, ch: AudioNode) {
  const at = n.at, dur = Math.max(0.03, n.dur), g = Math.min(1, n.g), f = mtof(n.n);
  if (n.v === 'sub') {
    const o = osc(ac, k, 'sine', f, at), o2 = osc(ac, k, 'sine', f * 2, at), g2 = ac.createGain(), eg = ac.createGain();
    g2.gain.value = 0.12;
    hold(eg.gain, at, dur, g, n.a ?? 0.08, 0.08);
    o.connect(eg); o2.connect(g2); g2.connect(eg); eg.connect(ch);
    const end = at + dur + 0.6;
    o.start(at); o2.start(at); o.stop(end); o2.stop(end);
    track(p, o, [eg, g2], [o.detune], k);
    track(p, o2, [], [o2.detune], k);
    return;
  }
  const a = osc(ac, k, k.bassWave, f, at), eg = ac.createGain();
  const cut = n.cut ?? 320;
  const lp = lowpass(ac, cut + 1600, 1.6);
  lp.frequency.setTargetAtTime(cut, at, 0.09);
  eg.gain.setValueAtTime(0, at);
  eg.gain.linearRampToValueAtTime(g, at + 0.004);
  eg.gain.setTargetAtTime(g * 0.65, at + 0.004, 0.12);
  eg.gain.setTargetAtTime(0, at + dur, 0.02);
  a.connect(lp); lp.connect(eg); eg.connect(ch);
  const end = at + dur + 0.15;
  a.start(at); a.stop(end);
  track(p, a, [lp, eg], [a.detune], k);
}

/** Additive drone: eight slightly stretched partials, each swelling on its own slow cycle, odd ones left and even right. */
function droneNote(ac: BaseAudioContext, k: Kit, p: Player, n: Note, ch: AudioNode) {
  const at = n.at, dur = Math.max(0.5, n.dur), g = Math.min(1, n.g), f = mtof(n.n);
  const eg = ac.createGain(), left = ac.createStereoPanner(), right = ac.createStereoPanner();
  left.pan.value = -0.55; right.pan.value = 0.55;
  left.connect(eg); right.connect(eg); eg.connect(ch);
  hold(eg.gain, at, dur, g, n.a ?? 3, 0.8);
  const end = at + dur + 5;
  const parts: { fk: number; amp: number }[] = [];
  for (let kk = 1; kk <= 8; kk++) {
    const fk = f * kk * (1 + 0.00035 * kk * kk);
    if (fk > 6000) break;
    parts.push({ fk, amp: (kk === 1 ? 0.5 : 1) / Math.pow(kk, 1.05) });
  }
  const norm = 1 / parts.reduce((s, x) => s + x.amp, 0);
  let seed = (n.n * 7919 + Math.round(at * 1000)) >>> 0;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  parts.forEach((x, i) => {
    const o = osc(ac, k, 'sine', x.fk, at);
    const pg = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
    const a = x.amp * norm * 2;
    pg.gain.value = a * 0.5;
    lfo.frequency.value = 0.03 + rnd() * 0.17;
    lg.gain.value = a * 0.5;
    lfo.connect(lg); lg.connect(pg.gain);
    o.connect(pg); pg.connect(i % 2 ? right : left);
    o.start(at); lfo.start(at); o.stop(end); lfo.stop(end);
    track(p, o, i === 0 ? [pg, lg, eg, left, right] : [pg, lg], [o.detune], k);
    track(p, lfo, [], [], k);
  });
}

/**
 * Strings and brass: two detuned saws a note. Strings share one filter on their channel. Brass keeps a filter per note,
 * since it opens with each attack.
 */
function padNote(ac: BaseAudioContext, k: Kit, p: Player, n: Note, ch: AudioNode) {
  const brass = n.v === 'brass';
  const at = n.at, dur = Math.max(0.1, n.dur), g = Math.min(1, n.g), f = mtof(n.n);
  const eg = ac.createGain(), pan = ac.createStereoPanner();
  pan.pan.value = n.pan ?? Math.max(-0.55, Math.min(0.55, (n.n - 64) / 22));
  let head: AudioNode = eg;
  const extra: AudioNode[] = [eg, pan];
  if (brass) {
    const cut = n.cut ?? 2200;
    const lp = lowpass(ac, cut, 0.9);
    lp.frequency.setValueAtTime(cut * 0.4, at);
    lp.frequency.linearRampToValueAtTime(cut * 1.35, at + 0.35);
    lp.frequency.setTargetAtTime(cut, at + 0.35, 0.7);
    lp.connect(eg);
    head = lp;
    extra.push(lp);
  }
  hold(eg.gain, at, dur, g, n.a ?? (brass ? 0.12 : 0.5), brass ? 0.1 : 0.16);
  eg.connect(pan); pan.connect(ch);
  const stop = at + dur + (brass ? 0.7 : 1);
  [-10, 10].forEach((c, i) => {
    const o = osc(ac, k, 'sawtooth', f, at, c + (n.det ?? 0) + ((n.n * 37 + i * 11) % 5) - 2);
    o.connect(head);
    o.start(at); o.stop(stop);
    track(p, o, i === 0 ? extra : [], [o.detune], k);
  });
}

const VOWELS = { oo: [[325, 1, 5], [800, 0.3, 7], [2400, 0.08, 9]], ah: [[730, 1, 5], [1090, 0.5, 7], [2440, 0.2, 9]] } as const;

/** One bank of three vowel formants. Biquads filter each channel on its own, so notes keep their place in the field. */
function formantBank(ac: BaseAudioContext, vowel: readonly (readonly number[])[], out: AudioNode, nodes: AudioNode[]): GainNode {
  const input = ac.createGain();
  for (const [fc, gain, q] of vowel) {
    const bp = ac.createBiquadFilter(), fg = ac.createGain();
    bp.type = 'bandpass'; bp.frequency.value = fc; bp.Q.value = q;
    fg.gain.value = gain * 4;
    input.connect(bp); bp.connect(fg); fg.connect(out);
    nodes.push(bp, fg);
  }
  nodes.push(input);
  return input;
}

/** Choir: paired saws with a vibrato that waits and then grows, blended between the oo and ah formant banks. */
function choirNote(ac: BaseAudioContext, k: Kit, p: Player, n: Note) {
  const at = n.at, dur = Math.max(0.2, n.dur), g = Math.min(1, n.g), f = mtof(n.n), ah = Math.max(0, Math.min(1, n.ah ?? 0));
  const eg = ac.createGain(), pan = ac.createStereoPanner(), toOo = ac.createGain(), toAh = ac.createGain();
  pan.pan.value = n.pan ?? Math.max(-0.6, Math.min(0.6, (n.n - 62) / 18));
  toOo.gain.value = 1 - ah;
  toAh.gain.value = ah;
  const a = osc(ac, k, 'sawtooth', f, at, -7), b = osc(ac, k, 'sawtooth', f, at, 7);
  const vibO = ac.createOscillator(), vib = ac.createGain();
  vibO.frequency.value = 4.8 + ((n.n * 13) % 9) / 10;
  vib.gain.setValueAtTime(0, at);
  vib.gain.setValueAtTime(0, at + 0.4);
  vib.gain.linearRampToValueAtTime(14, at + 1.6);
  vibO.connect(vib); vib.connect(a.detune); vib.connect(b.detune);
  a.connect(eg); b.connect(eg);
  hold(eg.gain, at, dur, g, n.a ?? 1.2, 0.3);
  eg.connect(pan); pan.connect(toOo); pan.connect(toAh);
  if (ah < 1) toOo.connect(p.oo);
  if (ah > 0) toAh.connect(p.ah);
  const stop = at + dur + 1.6;
  for (const s of [a, b, vibO]) { s.start(at); s.stop(stop); }
  track(p, a, [eg, pan, vib, toOo, toAh], [a.detune], k);
  track(p, b, [], [b.detune], k);
  track(p, vibO, [], [], k);
}

function hitNote(ac: BaseAudioContext, k: Kit, p: Player, n: Note, ch: AudioNode) {
  const at = n.at, dur = Math.max(0.02, n.dur), g = Math.min(1, n.g), kind = n.nz ?? 'tick';
  const eg = ac.createGain();
  const panned = n.pan !== undefined || kind === 'scan';
  const pan = panned ? ac.createStereoPanner() : null;
  if (pan) { pan.pan.value = n.pan ?? 0; eg.connect(pan); pan.connect(ch); } else eg.connect(ch);
  const drop = (from: number, to: number, fall: number, decay: number, level = 1) => {
    const o = ac.createOscillator(), og = ac.createGain();
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(to, at + fall);
    og.gain.setValueAtTime(g * level, at);
    og.gain.setTargetAtTime(0, at + 0.005, decay);
    o.connect(og); og.connect(eg);
    o.start(at); o.stop(at + decay * 6);
    track(p, o, [og], [], k);
  };
  const burst = (type: BiquadFilterType, fc: number, q: number, decay: number, level: number, len = decay * 6) => {
    const s = noise(ac, k), fl = ac.createBiquadFilter(), ng = ac.createGain();
    fl.type = type; fl.frequency.value = fc; fl.Q.value = q;
    ng.gain.setValueAtTime(g * level, at);
    ng.gain.setTargetAtTime(0, at + 0.002, decay);
    s.connect(fl); fl.connect(ng); ng.connect(eg);
    s.start(at, (at * 7.3) % 1.5); s.stop(at + len);
    track(p, s, [fl, ng], [], k);
  };
  eg.gain.value = 1;
  if (kind === 'kick') drop(150, 42, 0.12, 0.09, 1.2);
  else if (kind === 'snare') { burst('bandpass', 1800, 0.7, 0.05, 1.2); drop(220, 160, 0.05, 0.04, 0.5); }
  else if (kind === 'taiko') { drop(96, 52, 0.25, 0.16, 1.3); burst('lowpass', 420, 0.5, 0.08, 0.7); }
  else if (kind === 'tick') burst('highpass', 5200, 0.5, 0.004, 0.9, 0.04);
  else if (kind === 'boom') { drop(84, 30, 0.8, 0.35, 1.3); burst('bandpass', 1100, 1.2, 0.03, 0.5); }
  else {
    // Long noises: an envelope over the whole note.
    const s = noise(ac, k), fl = ac.createBiquadFilter(), ng = ac.createGain();
    if (kind === 'hiss') { fl.type = 'bandpass'; fl.frequency.value = 3000; fl.Q.value = 0.3; hold(ng.gain, at, dur, g * 0.5, n.a ?? 2, 0.6); }
    else if (kind === 'swell') {
      fl.type = 'bandpass'; fl.Q.value = 2;
      fl.frequency.setValueAtTime(300, at);
      fl.frequency.exponentialRampToValueAtTime(3600, at + dur);
      ng.gain.setValueAtTime(0, at);
      ng.gain.linearRampToValueAtTime(g, at + dur);
      ng.gain.setTargetAtTime(0, at + dur, 0.03);
    } else if (kind === 'scan') {
      // A beam passing: a narrow band sweeping up and back while it crosses the stereo field.
      fl.type = 'bandpass'; fl.Q.value = 14;
      fl.frequency.setValueAtTime(mtof(n.n), at);
      fl.frequency.exponentialRampToValueAtTime(mtof(n.n + 19), at + dur * 0.5);
      fl.frequency.exponentialRampToValueAtTime(mtof(n.n), at + dur);
      ng.gain.setValueAtTime(0, at);
      ng.gain.linearRampToValueAtTime(g * 3, at + dur * 0.5);
      ng.gain.linearRampToValueAtTime(0, at + dur);
      pan!.pan.setValueAtTime(-0.8, at);
      pan!.pan.linearRampToValueAtTime(0.8, at + dur);
    } else {
      // Corrupted data: a square wave hopping between pitches, gated with short ramps so it never clicks.
      const o = ac.createOscillator(), og = ac.createGain();
      o.type = 'square';
      let seed = Math.round(at * 997) >>> 0;
      for (let t = 0; t < dur; t += 0.035) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        o.frequency.setValueAtTime(400 + (seed % 2600), at + t);
        og.gain.setTargetAtTime((seed >> 9) % 3 ? g * 0.35 : 0, at + t, 0.002);
      }
      og.gain.setTargetAtTime(0, at + dur, 0.003);
      o.connect(og); og.connect(eg);
      o.start(at); o.stop(at + dur + 0.05);
      track(p, o, [og], [], k);
      return;
    }
    s.connect(fl); fl.connect(ng); ng.connect(eg);
    s.start(at, (at * 7.3) % 1.5); s.stop(at + dur + 3);
    track(p, s, [fl, ng], [], k);
  }
}

function voiceNote(ac: BaseAudioContext, k: Kit, p: Player, n: Note) {
  const ch = p.chans[n.v];
  switch (n.v) {
    case 'lead': case 'cold': return leadNote(ac, k, p, n, ch);
    case 'bell': case 'glass': return bellNote(ac, k, p, n, ch);
    case 'arp': return arpNote(ac, k, p, n, ch, false);
    case 'blip': return arpNote(ac, k, p, n, ch, true);
    case 'bass': case 'sub': return bassNote(ac, k, p, n, ch);
    case 'drone': return droneNote(ac, k, p, n, ch);
    case 'pad': case 'brass': return padNote(ac, k, p, n, ch);
    case 'choir': return choirNote(ac, k, p, n);
    case 'nz': return hitNote(ac, k, p, n, ch);
  }
}

// ---------------------------------------------------------------- scheduler

function lookahead(): number {
  try { return typeof document !== 'undefined' && document.hidden ? 1.5 : 0.12; } catch { return 0.12; }
}

function fill(ac: BaseAudioContext, k: Kit, p: Player, now: number, ahead: number, level = intensity) {
  const horizon = now + ahead;
  if (!p.ended && p.secEnd < now) { p.queue = []; p.qi = 0; p.secEnd = now + 0.05; }
  let guard = 0;
  while (!p.ended && p.secEnd < horizon + 0.05 && guard++ < 8) {
    if (p.stopAt !== null && p.secEnd >= p.stopAt) break;
    const s = p.seq.next(p.secEnd);
    if (!s) { p.ended = true; break; }
    for (const n of s.notes) p.queue.push(n);
    p.secEnd += s.secs;
  }
  const muted = isMuted();
  while (p.qi < p.queue.length && p.queue[p.qi].at < horizon) {
    const n = p.queue[p.qi++];
    if (n.at < now - 0.01) continue;
    if (p.stopAt !== null && n.at >= p.stopAt) continue;
    if ((n.lay ?? 0) > level || (n.top !== undefined && level >= n.top)) continue;
    if (muted) continue;
    try { voiceNote(ac, k, p, n); } catch { /* one bad note must not stop the score */ }
  }
  if (p.qi > 256) { p.queue = p.queue.slice(p.qi); p.qi = 0; }
}

function dispose(p: Player) {
  for (const s of p.live) { try { s.stop(); } catch { /* ignore */ } }
  p.live.clear();
  for (const n of p.nodes) { try { n.disconnect(); } catch { /* ignore */ } }
}

function tick() {
  const ac = audioContext();
  if (!ac || !kit) return;
  try {
    const now = ac.currentTime, ahead = lookahead();
    if (player) fill(ac, kit, player, now, ahead);
    for (let i = dying.length - 1; i >= 0; i--) {
      const d = dying[i];
      if (d.stopAt !== null && now > d.stopAt + 0.3) { dispose(d); dying.splice(i, 1); }
      else fill(ac, kit, d, now, ahead);
    }
  } catch { /* never throw from the timer */ }
}

function fadeOut(ac: BaseAudioContext, p: Player, fade: number) {
  const now = ac.currentTime, f = Math.max(0.02, fade);
  try {
    p.out.gain.cancelScheduledValues(now);
    p.out.gain.setValueAtTime(p.out.gain.value, now);
    p.out.gain.linearRampToValueAtTime(0, now + f);
  } catch { /* ignore */ }
  p.stopAt = now + f;
  dying.push(p);
}

/** Sets the echo to a dotted eighth at the track's tempo and the drift to the track's depth. */
function tune(ac: BaseAudioContext, k: Kit, def: TrackDef) {
  const now = ac.currentTime;
  const t = Math.min(1.5, 0.75 * (60 / def.bpm));
  k.echoL.delayTime.setTargetAtTime(t, now, 0.3);
  k.echoR.delayTime.setTargetAtTime(t, now, 0.3);
  k.wob.gain.setTargetAtTime(def.wobble ?? 3, now, 0.5);
}

function start(id: TrackId, fade: number) {
  const ac = audioContext();
  if (!ac || !kit) return;
  try {
    const old = player;
    if (old) fadeOut(ac, old, fade);
    const p = makePlayer(ac, kit, id, kit.bus);
    const now = ac.currentTime;
    p.out.gain.setValueAtTime(0, now);
    p.out.gain.linearRampToValueAtTime(p.seq.def.level ?? 1, now + Math.max(0.01, old ? fade : Math.min(fade, 0.4)));
    tune(ac, kit, p.seq.def);
    player = p;
    fill(ac, kit, p, now, lookahead());
  } catch { player = null; }
}

function ready() {
  const ac = audioContext(), master = audioMaster();
  if (!ac || !master || kit) return;
  try {
    kit = buildKit(ac, master);
    kit.talkDuck.gain.value = talking ? 0.45 : 1;
    if (timer === null) timer = setInterval(tick, 25);
    if (desired) start(desired, 0.6);
  } catch { kit = null; }
}

onAudioReady(ready);

/**
 * Renders a track or a stinger offline, for checking levels without listening. Browser only. Returns the buffer and the
 * loudest one-second RMS and the peak, both in dBFS.
 */
export async function renderOffline(
  src: TrackId | StingerId | Section,
  seconds: number,
  opts: { level?: number; seed?: number; only?: Voice[] } = {},
): Promise<{ buffer: AudioBuffer; rms: number; peak: number }> {
  const sr = 44100, level = opts.level ?? 0;
  const ac = new OfflineAudioContext(2, Math.round(sr * seconds), sr);
  const k = buildKit(ac, ac.destination);
  const keep = (n: Note) => n.at < seconds && (n.lay ?? 0) <= level && (n.top === undefined || level < n.top) && (!opts.only || opts.only.includes(n.v));
  if (typeof src !== 'string' || (src in STINGERS && !(src in TRACKS))) {
    const p = makePlayer(ac, k, 'title', k.post, opts.seed ?? 1);
    const sec = typeof src === 'string' ? STINGERS[src as StingerId]() : src;
    const spb = 60 / sec.bpm;
    for (const e of normalize(sec)) { const n = { ...e, at: 0.05 + e.t * spb, dur: e.d * spb }; if (keep(n)) voiceNote(ac, k, p, n); }
  } else {
    const was = intensity;
    intensity = level;
    const p = makePlayer(ac, k, src as TrackId, k.bus, opts.seed ?? 1);
    tune(ac, k, p.seq.def);
    for (let t = 0; t < seconds;) {
      const s = p.seq.next(t);
      if (!s) break;
      for (const n of s.notes) if (keep(n)) voiceNote(ac, k, p, n);
      t += s.secs;
    }
    intensity = was;
  }
  const buffer = await ac.startRendering();
  let peak = 0, best = 0;
  const L = buffer.getChannelData(0), R = buffer.getChannelData(1);
  for (let s = 0; s + sr <= L.length; s += sr / 2) {
    let acc = 0;
    for (let i = s; i < s + sr; i++) { acc += L[i] * L[i] + R[i] * R[i]; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
    best = Math.max(best, Math.sqrt(acc / (2 * sr)));
  }
  const db = (x: number) => 20 * Math.log10(Math.max(1e-9, x));
  return { buffer, rms: db(best), peak: db(peak) };
}

export const music = {
  play(track: TrackId, fadeSeconds = 1): void {
    try {
      if (!TRACKS[track] || track === desired) return;
      desired = track;
      intensity = 0;
      start(track, Math.max(0, Number.isFinite(fadeSeconds) ? fadeSeconds : 1));
    } catch { /* never throw */ }
  },
  stop(fadeSeconds = 1): void {
    try {
      desired = null;
      const ac = audioContext();
      if (ac && player) fadeOut(ac, player, Math.max(0, fadeSeconds));
      player = null;
    } catch { /* never throw */ }
  },
  current(): TrackId | null {
    return desired;
  },
  /** True once a track that does not loop has played its last note, and always true without audio. */
  finished(): boolean {
    const ac = audioContext();
    if (!ac || !player) return true;
    return player.ended && ac.currentTime >= player.secEnd;
  },
  stinger(id: StingerId): void {
    const ac = audioContext();
    if (!ac || !kit || isMuted() || !STINGERS[id]) return;
    try {
      if (!stingP) stingP = makePlayer(ac, kit, 'title', kit.post);
      const sec = STINGERS[id]();
      const now = ac.currentTime + 0.03, spb = 60 / sec.bpm;
      let last = 0;
      for (const e of normalize(sec)) {
        const n: Note = { ...e, at: now + e.t * spb, dur: e.d * spb };
        last = Math.max(last, n.at + n.dur);
        voiceNote(ac, kit, stingP, n);
      }
      const d = kit.stingDuck.gain;
      d.cancelScheduledValues(now);
      d.setValueAtTime(d.value, now);
      d.linearRampToValueAtTime(0.3, now + 0.06);
      d.setValueAtTime(0.3, Math.max(now + 0.07, last - 0.2));
      d.linearRampToValueAtTime(1, Math.max(now + 0.07, last - 0.2) + 0.8);
    } catch { /* never throw */ }
  },
  setIntensity(x: number): void {
    intensity = Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
  },
  setSpellMelodies(pages: number[][]): void {
    try {
      spells = (Array.isArray(pages) ? pages : []).slice(0, 16).map((p) =>
        (Array.isArray(p) ? p : []).filter((n) => typeof n === 'number' && Number.isFinite(n)).slice(0, 32).map((n) => Math.max(-24, Math.min(36, n))));
    } catch { spells = []; }
  },
  duck(on: boolean): void {
    talking = !!on;
    const ac = audioContext();
    if (!ac || !kit) return;
    try { kit.talkDuck.gain.setTargetAtTime(talking ? 0.45 : 1, ac.currentTime, 0.12); } catch { /* ignore */ }
  },
};
