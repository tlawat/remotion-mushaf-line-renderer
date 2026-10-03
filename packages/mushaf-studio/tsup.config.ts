import {defineConfig, type Options} from 'tsup';

/**
 * Same output layout as the main package: dist/esm/index.mjs (+ .d.mts) and dist/cjs/index.js
 * (+ .d.ts), deterministic names, no data inside. Everything a Remotion project has already
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

export default defineConfig([
  {...shared, format: ['esm'], outDir: 'dist/esm', clean: true, outExtension: () => ({js: '.mjs'}), dts: {entry}},
  {...shared, format: ['cjs'], outDir: 'dist/cjs', clean: false, outExtension: () => ({js: '.js'}), dts: {entry}},
]);
