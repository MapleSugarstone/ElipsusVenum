import { BAYER, fitToGrid } from './void.ts';

let canvas: HTMLCanvasElement | null = null;
let raf = 0;
let done: ReturnType<typeof setTimeout> | undefined;

/** Covers the window in void, then uncovers it through an ordered dither on the art-pixel grid over a quarter second. */
export function dissolveIn(ms = 260): void {
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'wipe';
    document.body.append(canvas);
  }
  const c = canvas;
  const { w, h, ox, oy } = fitToGrid(c);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  cancelAnimationFrame(raf);
  const start = performance.now();
  const frame = () => {
    const k = (performance.now() - start) / ms;
    const d = img.data;
    for (let y = 0; y < h; y++) {
      // Bands of 2 by 2 art pixels share a threshold, so the dissolve reads as chunky without breaking the grid.
      const by = ((y - oy) >> 1) & 3;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const covered = BAYER[by][((x - ox) >> 1) & 3] > k;
        d[i] = 6;
        d[i + 1] = 8;
        d[i + 2] = 1;
        d[i + 3] = covered ? 255 : 0;
      }
    }
    ctx.putImageData(img, 0, 0);
    if (k < 1) raf = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, w, h);
  };
  frame();
  // Hidden pages get no animation frames, so a timer makes sure the cover still comes off.
  clearTimeout(done);
  done = setTimeout(() => {
    cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, w, h);
  }, ms + 80);
}
