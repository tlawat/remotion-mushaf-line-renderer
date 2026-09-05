import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';

// Serves the <Player> harness at http://localhost:4173/player/ (fonts from ./public).
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: 'public',
  server: {
    port: 4173,
    strictPort: true,
    fs: {
      // The harness imports the package's test fixtures from the workspace root.
      allow: [fileURLToPath(new URL('..', import.meta.url))],
    },
  },
  optimizeDeps: {
    // Pre-bundle the Remotion packages the harness uses so that only one copy of each is served.
    include: ['react', 'react-dom/client', 'remotion', '@remotion/player', '@remotion/transitions', '@remotion/transitions/fade', '@remotion/transitions/slide', '@remotion/transitions/none', '@remotion/transitions/dissolve'],
  },
});
