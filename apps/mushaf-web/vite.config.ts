import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';

// A static site: `vite build` writes dist/ with relative URLs (`base: './'`), so it can be served
// from any folder of any static host.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  resolve: {
    // One copy of each: the Player, the compositions and the web renderer share Remotion's contexts.
    dedupe: ['react', 'react-dom', 'remotion', 'zod'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom/client', 'remotion', '@remotion/player', '@remotion/transitions/fade'],
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
  server: {port: 5174},
  preview: {port: 4174},
});
