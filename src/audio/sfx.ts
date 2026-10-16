/** Small procedural sound effects. Each one is a short synth voice, so no audio files ship. */

import { audioContext, isMuted, setVolumes, sfxOut } from './audio.ts';

export function setSfxVolume(v: number): void {
  setVolumes({ sfx: v });
}

interface Voice {
  type: OscillatorType | 'noise';
  from: number;
  to: number;
  dur: number;
  gain: number;
  delay?: number;
  filter?: number;
}

function play(voices: Voice[]): void {
  const ac = audioContext();
  const master = sfxOut();
  if (!ac || !master || isMuted()) return;
  const now = ac.currentTime;
  for (const v of voices) {
    const t0 = now + (v.delay ?? 0);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v.gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + v.dur);
    let src: AudioScheduledSourceNode;
    if (v.type === 'noise') {
      const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * v.dur), ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const n = ac.createBufferSource();
      n.buffer = buf;
      src = n;
    } else {
      const o = ac.createOscillator();
      o.type = v.type;
      o.frequency.setValueAtTime(v.from, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, v.to), t0 + v.dur);
      src = o;
    }
    let node: AudioNode = src;
    if (v.filter) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = v.filter;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + v.dur + 0.02);
  }
}

const SOUNDS: Record<string, Voice[]> = {
  card: [{ type: 'noise', from: 0, to: 0, dur: 0.06, gain: 0.25, filter: 2400 }],
  draw: [{ type: 'noise', from: 0, to: 0, dur: 0.08, gain: 0.18, filter: 3200 }],
  place: [{ type: 'triangle', from: 180, to: 90, dur: 0.12, gain: 0.35 }, { type: 'noise', from: 0, to: 0, dur: 0.05, gain: 0.15, filter: 900 }],
  move: [{ type: 'sine', from: 260, to: 200, dur: 0.1, gain: 0.15 }],
  attack: [{ type: 'sawtooth', from: 320, to: 120, dur: 0.12, gain: 0.12, filter: 1400 }],
  hit: [{ type: 'square', from: 140, to: 60, dur: 0.14, gain: 0.2, filter: 900 }, { type: 'noise', from: 0, to: 0, dur: 0.08, gain: 0.2, filter: 1800 }],
  die: [{ type: 'triangle', from: 220, to: 50, dur: 0.35, gain: 0.3 }, { type: 'noise', from: 0, to: 0, dur: 0.25, gain: 0.12, filter: 600 }],
  scaleUp: [{ type: 'sine', from: 520, to: 700, dur: 0.12, gain: 0.16 }],
  scaleDown: [{ type: 'sine', from: 300, to: 180, dur: 0.16, gain: 0.18 }],
  candle: [{ type: 'noise', from: 0, to: 0, dur: 0.5, gain: 0.2, filter: 500 }, { type: 'sine', from: 330, to: 110, dur: 0.6, gain: 0.2 }],
  bell: [{ type: 'sine', from: 880, to: 870, dur: 0.9, gain: 0.2 }, { type: 'sine', from: 1320, to: 1310, dur: 0.6, gain: 0.08 }, { type: 'triangle', from: 440, to: 438, dur: 1.1, gain: 0.1 }],
  win: [
    { type: 'triangle', from: 392, to: 392, dur: 0.18, gain: 0.2 },
    { type: 'triangle', from: 523, to: 523, dur: 0.18, gain: 0.2, delay: 0.12 },
    { type: 'triangle', from: 659, to: 659, dur: 0.3, gain: 0.2, delay: 0.24 },
  ],
  coin: [{ type: 'square', from: 1200, to: 1500, dur: 0.08, gain: 0.08, filter: 4000 }, { type: 'square', from: 1600, to: 1800, dur: 0.1, gain: 0.06, delay: 0.08, filter: 4000 }],
  click: [{ type: 'sine', from: 600, to: 500, dur: 0.05, gain: 0.08 }],
};

/** One talking blip for Your Best Friend. The letter picks a note from a cheerful scale. */
export function blip(code: number): void {
  const scale = [0, 2, 4, 7, 9, 12, 6];
  const semis = scale[code % scale.length];
  const f = 330 * 2 ** (semis / 12);
  play([{ type: 'square', from: f, to: f * 0.97, dur: 0.045, gain: 0.05, filter: 2200 }]);
}

export function sfx(name: keyof typeof SOUNDS | string): void {
  const v = SOUNDS[name];
  if (v) play(v);
}
