import {defineConfig, type Options} from 'tsup';

/**
 * dist/esm/index.mjs (+ .d.mts), deterministic names, no data inside. Everything a Remotion project has already
 * (React, Remotion, zod, the main package) stays external.
 */
const entry = {index: 'src/index.ts'};

const shared: Options = {
  entry,
  target: 'es2020',
  platform: 'browser',
  splitting: false,
  treeshake: true,
  sourcemap: true,
  minify: false,
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    'remotion',
    /^remotion\//,
    /^@remotion\//,
    'zod',
    '@tlawat/remotion-mushaf-line',
    /^@tlawat\/mushaf-fonts-/,
  ],
  esbuildOptions(options) {
    options.charset = 'ascii';
  },
};

// ESM only: @remotion/media (the <Audio> of the in-browser renderer) ships ESM only, and every
// Remotion bundler (the Studio's webpack, Vite for a <Player>) reads ESM.
export default defineConfig([
  {...shared, format: ['esm'], outDir: 'dist/esm', clean: true, outExtension: () => ({js: '.mjs'}), dts: {entry}},
]);
