// Music engine: a lookahead scheduler over the generators in score.ts, voiced like a small console sound chip.
// Ported from the chiptune skill reference. The tracks and stingers are this game's own.
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

const MONO: ReadonlySet<Voice> = new Set<Voice>(['p1', 'p2', 'tri', 'nz', 'air']);
const BELL_POLY = 2;

function bandsOverlap(a: Ev, b: Ev): boolean {
  return Math.max(a.lay ?? 0, b.lay ?? 0) < Math.min(a.top ?? 2, b.top ?? 2);
}

/** Enforces the chip's limits: one note at a time on each mono voice, two on the bell, nothing past the section end. */
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
          // Two notes on the same instant: the louder one wins, so a kick beats a hat.
          if (b.t - a.t < 0.03) { if (b.g > a.g) { dead.add(a); break; } dead.add(b); continue; }
          a.d = Math.min(a.d, b.t - a.t - 0.01);
          break;
        }
      }
    } else {
      const ringing: Ev[] = [];
      for (const e of list) {
        for (let k = ringing.length - 1; k >= 0; k--) if (ringing[k].t + ringing[k].d <= e.t) ringing.splice(k, 1);
        if (ringing.length >= BELL_POLY) {
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

// ---------------------------------------------------------------- voices

const BASE: Record<Voice, number> = { p1: 0.3, p2: 0.28, tri: 0.55, nz: 0.4, bell: 0.34, air: 0.75 };
const PAN: Record<Voice, number> = { p1: -0.25, p2: 0.25, tri: 0, nz: 0.06, bell: 0.15, air: -0.12 };
const SEND: Record<Voice, number> = { p1: 0.55, p2: 0.55, tri: 0.12, nz: 0.25, bell: 1, air: 1 };
const VOICES: Voice[] = ['p1', 'p2', 'tri', 'nz', 'bell', 'air'];
const DUTIES = [0.125, 0.25, 0.5, 0.375];

interface Kit {
  pulse: PeriodicWave[];
  tri: PeriodicWave;
  white: AudioBuffer;
  metal: AudioBuffer;
  wob: GainNode;
  bus: GainNode;
  echoIn: GainNode;
  stingDuck: GainNode;
  talkDuck: GainNode;
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

function buildKit(ac: AudioContext, master: GainNode): Kit {
  const pulse = DUTIES.map((d) => {
    const H = 28, re = new Float32Array(H + 1), im = new Float32Array(H + 1);
    for (let h = 1; h <= H; h++) re[h] = Math.sin(Math.PI * h * d) / h;
    return ac.createPeriodicWave(re, im);
  });
  // A 32-step triangle, the stepped shape of a console bass channel.
  const N = 256, H = 32, x = new Float32Array(N);
  for (let i = 0; i < N; i++) { const ph = i / N; const tri = ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4; x[i] = Math.round(tri * 7.5) / 7.5; }
  const re = new Float32Array(H + 1), im = new Float32Array(H + 1);
  for (let h = 1; h <= H; h++) {
    let a = 0, b = 0;
    for (let i = 0; i < N; i++) { a += x[i] * Math.cos((2 * Math.PI * h * i) / N); b += x[i] * Math.sin((2 * Math.PI * h * i) / N); }
    re[h] = (2 * a) / N; im[h] = (2 * b) / N;
  }
  const tri = ac.createPeriodicWave(re, im);
  const sr = ac.sampleRate;
  const white = ac.createBuffer(1, sr * 2, sr);
  const wd = white.getChannelData(0);
  for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
  // Short-mode LFSR noise: a buzzy metallic loop.
  const metal = ac.createBuffer(1, sr, sr);
  const md = metal.getChannelData(0);
  let reg = 1, hold = Math.max(1, Math.round(sr / 9000)), v = 1;
  for (let i = 0; i < md.length; i++) {
    if (i % hold === 0) { const bit = (reg ^ (reg >> 6)) & 1; reg = (reg >> 1) | (bit << 14); v = reg & 1 ? 1 : -1; }
    md[i] = v;
  }
  const wob = ac.createGain();
  wob.gain.value = 5;
  for (const [f, g] of [[0.19, 1], [0.061, 0.7]] as const) {
    const o = ac.createOscillator(), og = ac.createGain();
    o.frequency.value = f; og.gain.value = g;
    o.connect(og); og.connect(wob); o.start();
  }
  const stingDuck = ac.createGain();
  const talkDuck = ac.createGain();
  const bus = ac.createGain();
  bus.gain.value = 1;
  bus.connect(talkDuck); talkDuck.connect(stingDuck); stingDuck.connect(master);
  const echoIn = ac.createGain();
  const dl = ac.createDelay(1);
  dl.delayTime.value = 0.34;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 2200;
  const fb = ac.createGain();
  fb.gain.value = 0.36;
  const echoOut = ac.createGain();
  echoOut.gain.value = 0.42;
  echoIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(echoOut); echoOut.connect(bus);
  return { pulse, tri, white, metal, wob, bus, echoIn, stingDuck, talkDuck };
}

function makePlayer(ac: AudioContext, k: Kit, id: TrackId, dest: AudioNode, sends: boolean): Player {
  const seq = new Seq(id, (sessionSeed = (Math.imul(sessionSeed, 1103515245) + 12345 + Date.now()) >>> 0), {
    int: () => intensity,
    spells: () => spells,
  });
  const def = seq.def;
  const out = ac.createGain();
  out.connect(dest);
  const nodes: AudioNode[] = [out];
  const chans = {} as Record<Voice, AudioNode>;
  for (const v of VOICES) {
    const g = ac.createGain();
    g.gain.value = BASE[v] * (def.mix?.[v] ?? 1);
    let tail: AudioNode = g;
    if (v === 'p1' || v === 'p2') {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 4200; f.Q.value = 0.4;
      tail.connect(f); tail = f; nodes.push(f);
    }
    if (typeof ac.createStereoPanner === 'function') {
      const p = ac.createStereoPanner();
      p.pan.value = PAN[v];
      tail.connect(p); tail = p; nodes.push(p);
    }
    tail.connect(out);
    if (sends) {
      const s = ac.createGain();
      s.gain.value = (def.echo ?? 0.3) * SEND[v];
      tail.connect(s); s.connect(k.echoIn); nodes.push(s);
    }
    nodes.push(g);
    chans[v] = g;
  }
  return { id, seq, out, chans, nodes, queue: [], qi: 0, secEnd: ac.currentTime + 0.06, ended: false, stopAt: null, live: new Set() };
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

function envelope(p: AudioParam, at: number, dur: number, peak: number, a: number, rel: number, sus: number, dec: number) {
  p.setValueAtTime(0, at);
  p.linearRampToValueAtTime(peak, at + a);
  if (dur > a + 0.01) p.setTargetAtTime(peak * sus, at + a, dec);
  p.setTargetAtTime(0, at + Math.max(dur, a), rel / 5);
}

function bendTo(p: AudioParam, f: number, at: number, dur: number, semis: number) {
  p.setValueAtTime(f, at + dur * 0.5);
  p.exponentialRampToValueAtTime(f * Math.pow(2, semis / 12), at + dur);
}

function voiceNote(ac: AudioContext, k: Kit, p: Player, n: Note, spread: number) {
  const ch = p.chans[n.v];
  const at = n.at, dur = Math.max(0.02, n.dur), g = Math.min(1, n.g);
  if (n.v === 'nz') return noiseNote(ac, k, p, n, ch);
  const f = mtof(n.n);
  if (n.v === 'p1' || n.v === 'p2' || n.v === 'tri') {
    const o = ac.createOscillator();
    o.setPeriodicWave(n.v === 'tri' ? k.tri : k.pulse[(n.duty ?? 1) & 3]);
    o.frequency.setValueAtTime(f, at);
    if (n.bend) bendTo(o.frequency, f, at, dur, n.bend);
    o.detune.value = (n.det ?? 0) + (n.v === 'p2' ? spread : 0) + (Math.random() * 6 - 3);
    k.wob.connect(o.detune);
    const eg = ac.createGain();
    const rel = n.v === 'tri' ? 0.03 : 0.06;
    if (n.v === 'tri') envelope(eg.gain, at, dur, g, n.a ?? 0.006, rel, 1, 1);
    else envelope(eg.gain, at, dur, g, n.a ?? 0.008, rel, 0.72, 0.18);
    o.connect(eg); eg.connect(ch);
    o.start(at); o.stop(at + dur + rel + 0.02);
    track(p, o, [eg], [o.detune], k);
    return;
  }
  if (n.v === 'bell') {
    const ratio = n.ratio ?? 3.5;
    const car = ac.createOscillator(), mod = ac.createOscillator(), mg = ac.createGain(), eg = ac.createGain();
    car.frequency.setValueAtTime(f, at);
    mod.frequency.setValueAtTime(f * ratio, at);
    if (n.bend) { bendTo(car.frequency, f, at, dur, n.bend); bendTo(mod.frequency, f * ratio, at, dur, n.bend); }
    car.detune.value = n.det ?? 0;
    mod.detune.value = n.det ?? 0;
    k.wob.connect(car.detune); k.wob.connect(mod.detune);
    mg.gain.setValueAtTime(f * 2.2, at);
    mg.gain.exponentialRampToValueAtTime(f * 0.12, at + Math.min(dur, 1.2) + 0.01);
    const end = at + dur + 0.3;
    eg.gain.setValueAtTime(0, at);
    eg.gain.linearRampToValueAtTime(g, at + (n.a ?? 0.004));
    eg.gain.exponentialRampToValueAtTime(0.0006, end);
    mod.connect(mg); mg.connect(car.frequency); car.connect(eg); eg.connect(ch);
    car.start(at); mod.start(at); car.stop(end + 0.02); mod.stop(end + 0.02);
    track(p, car, [eg, mg], [car.detune, mod.detune], k);
    track(p, mod, [], [], k);
    return;
  }
  // Breath: noise through a narrow band at the pitch, with a faint sine under it.
  const src = ac.createBufferSource(), bp = ac.createBiquadFilter(), ng = ac.createGain();
  const o = ac.createOscillator(), og = ac.createGain(), eg = ac.createGain();
  src.buffer = k.white; src.loop = true;
  bp.type = 'bandpass'; bp.frequency.setValueAtTime(f, at); bp.Q.value = 16;
  ng.gain.value = 3.4;
  o.type = 'sine'; o.frequency.setValueAtTime(f, at); og.gain.value = 0.32;
  if (n.bend) { bendTo(bp.frequency, f, at, dur, n.bend); bendTo(o.frequency, f, at, dur, n.bend); }
  o.detune.value = n.det ?? 0;
  k.wob.connect(o.detune); k.wob.connect(bp.detune);
  envelope(eg.gain, at, dur, g, n.a ?? 0.07, 0.25, 0.85, 0.4);
  src.connect(bp); bp.connect(ng); ng.connect(eg); o.connect(og); og.connect(eg); eg.connect(ch);
  const stop = at + dur + 0.3;
  src.start(at, Math.random() * 1.5); o.start(at); src.stop(stop); o.stop(stop);
  track(p, src, [bp, ng, eg], [bp.detune], k);
  track(p, o, [og], [o.detune], k);
}

function noiseNote(ac: AudioContext, k: Kit, p: Player, n: Note, ch: AudioNode) {
  const at = n.at, dur = Math.max(0.02, n.dur), g = Math.min(1, n.g), kind = n.nz ?? 'hat';
  const eg = ac.createGain();
  eg.connect(ch);
  if (kind === 'kick') {
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, at);
    o.frequency.exponentialRampToValueAtTime(42, at + 0.12);
    eg.gain.setValueAtTime(g, at);
    eg.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
    o.connect(eg); o.start(at); o.stop(at + 0.25);
    track(p, o, [eg], [], k);
    return;
  }
  const src = ac.createBufferSource(), f = ac.createBiquadFilter();
  const metal = kind === 'tick' || kind === 'tock';
  src.buffer = metal ? k.metal : k.white;
  src.loop = true;
  let end = at + dur;
  if (kind === 'hat') { f.type = 'highpass'; f.frequency.value = 7000; end = at + Math.min(dur, 0.07); }
  else if (kind === 'snare') { f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7; end = at + 0.16; }
  else if (kind === 'tick') { f.type = 'highpass'; f.frequency.value = 3500; end = at + 0.03; }
  else if (kind === 'tock') { f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 2; src.playbackRate.value = 0.5; end = at + 0.04; }
  else if (kind === 'stamp') { f.type = 'lowpass'; f.frequency.value = 1100; end = at + 0.2; }
  else if (kind === 'sweep') {
    f.type = 'bandpass'; f.Q.value = 5;
    const lo = 300, hi = 3600, up = n.n < 60;
    f.frequency.setValueAtTime(up ? lo : hi, at);
    f.frequency.exponentialRampToValueAtTime(up ? hi : lo, at + dur);
  } else { f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 0.3; }
  if (kind === 'sweep' || kind === 'rush') envelope(eg.gain, at, dur, g, n.a ?? dur * 0.4, 0.4, 1, 1);
  else { eg.gain.setValueAtTime(g, at); eg.gain.exponentialRampToValueAtTime(0.001, end); }
  src.connect(f); f.connect(eg);
  src.start(at, Math.random() * 0.9);
  src.stop(Math.max(end, at + dur) + 0.45);
  track(p, src, [f, eg], [], k);
}

// ---------------------------------------------------------------- scheduler

function lookahead(): number {
  try { return typeof document !== 'undefined' && document.hidden ? 1.5 : 0.12; } catch { return 0.12; }
}

function fill(ac: AudioContext, k: Kit, p: Player, now: number, ahead: number) {
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
  const spread = p.seq.def.spread ?? 7;
  while (p.qi < p.queue.length && p.queue[p.qi].at < horizon) {
    const n = p.queue[p.qi++];
    if (n.at < now - 0.01) continue;
    if (p.stopAt !== null && n.at >= p.stopAt) continue;
    if ((n.lay ?? 0) > intensity || (n.top !== undefined && intensity >= n.top)) continue;
    if (muted) continue;
    try { voiceNote(ac, k, p, n, spread); } catch { /* one bad note must not stop the score */ }
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

function fadeOut(ac: AudioContext, p: Player, fade: number) {
  const now = ac.currentTime, f = Math.max(0.02, fade);
  try {
    p.out.gain.cancelScheduledValues(now);
    p.out.gain.setValueAtTime(p.out.gain.value, now);
    p.out.gain.linearRampToValueAtTime(0, now + f);
  } catch { /* ignore */ }
  p.stopAt = now + f;
  dying.push(p);
}

function start(id: TrackId, fade: number) {
  const ac = audioContext();
  if (!ac || !kit) return;
  try {
    const old = player;
    if (old) fadeOut(ac, old, fade);
    const p = makePlayer(ac, kit, id, kit.bus, true);
    const now = ac.currentTime;
    p.out.gain.setValueAtTime(0, now);
    p.out.gain.linearRampToValueAtTime(1, now + Math.max(0.01, old ? fade : Math.min(fade, 0.4)));
    kit.wob.gain.setTargetAtTime(p.seq.def.wobble ?? 5, now, 0.5);
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
      if (!stingP) stingP = makePlayer(ac, kit, 'title', audioMaster() ?? kit.bus, false);
      const sec = STINGERS[id]();
      const now = ac.currentTime + 0.03, spb = 60 / sec.bpm;
      let last = 0;
      for (const e of normalize(sec)) {
        const n: Note = { ...e, at: now + e.t * spb, dur: e.d * spb };
        last = Math.max(last, n.at + n.dur);
        voiceNote(ac, kit, stingP, n, 7);
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
