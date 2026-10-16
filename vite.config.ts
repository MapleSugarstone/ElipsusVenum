import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';

/** A hash of every file that decides what a command does, so two builds that would disagree never share a room. */
function buildFingerprint(): string {
  const hash = createHash('sha256');
  const walk = (dir: string) => {
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts')) hash.update(p.replace(/\\/g, '/')).update(readFileSync(p, 'utf8').replace(/\r\n/g, '\n'));
    }
  };
  for (const dir of ['src/engine', 'src/content', 'src/run', 'src/net']) walk(dir);
  return hash.digest('hex').slice(0, 12);
}

export default defineConfig({
  // Relative asset paths let the same build run from any GitHub Pages subfolder.
  base: './',
  define: {
    __BUILD__: JSON.stringify(buildFingerprint()),
    __RELAY_URL__: JSON.stringify(process.env.RELAY_URL || 'https://elipsusvenum-relay.maplesugarstone.workers.dev'),
  },
  build: { outDir: 'dist', sourcemap: true, target: 'es2022', rollupOptions: { input: { main: 'index.html', review: 'review.html' } } },
  server: {
    port: Number(process.env.PORT) || 5180,
    watch: { ignored: ['**/runs/**', '**/Notes/**', '**/server/**'] },
    proxy: {
      '/api': { target: process.env.WORKER_URL ?? 'http://127.0.0.1:8787', changeOrigin: true, ws: true },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
