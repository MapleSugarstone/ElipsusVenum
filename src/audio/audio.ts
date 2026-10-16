// One AudioContext, one master gain, and one mute state for music and sound effects. Nothing touches Web Audio until
// the first user gesture, and the module imports safely in Node so tests and simulators can load the score.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let sfxBus: GainNode | null = null;
let muted = false;
let volumes = { music: 0.5, sfx: 0.6 };
const readyFns: (() => void)[] = [];

function create(): void {
  if (ctx || typeof window === 'undefined') return;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = volumes.music * 0.8;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = volumes.sfx;
    sfxBus.connect(master);
    for (const fn of readyFns) fn();
  } catch {
    ctx = null;
  }
}

if (typeof window !== 'undefined') {
  const wake = () => {
    create();
    if (ctx?.state === 'suspended') void ctx.resume();
  };
  window.addEventListener('pointerdown', wake);
  window.addEventListener('keydown', wake);
}

export function audioContext(): AudioContext | null {
  return ctx;
}

/** The bus music plays into. The engine treats it as its master. */
export function audioMaster(): GainNode | null {
  return musicBus;
}

export function sfxOut(): GainNode | null {
  return sfxBus;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05);
}

export function setVolumes(v: { music?: number; sfx?: number }): void {
  volumes = { ...volumes, ...v };
  if (ctx && musicBus) musicBus.gain.setTargetAtTime(volumes.music * 0.8, ctx.currentTime, 0.05);
  if (ctx && sfxBus) sfxBus.gain.setTargetAtTime(volumes.sfx, ctx.currentTime, 0.05);
}

export function onAudioReady(fn: () => void): void {
  readyFns.push(fn);
  if (ctx) fn();
}
