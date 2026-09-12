import {defineConfig, type Options} from 'tsup';

/**
 * Output layout (deterministic file names, no hashes, so Lambda `publicPath` bundles and README
 * instructions can name them):
 *
 *   dist/esm/index.mjs (+ index.d.mts)      dist/cjs/index.js (+ index.d.ts)
 *
 * The package ships no mushaf data: the layout is built at runtime from QUL's exports (see
 * src/data/load-layout.ts), so the main chunk is all there is.
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
  external: ['react', 'react/jsx-runtime', 'react-dom', 'remotion', /^remotion\//, /^@remotion\//],
  esbuildOptions(options) {
    options.charset = 'ascii'; // no encoding surprises in any bundler
  },
};

export default defineConfig([
  {
    ...shared,
    format: ['esm'],
    outDir: 'dist/esm',
    clean: true,
    outExtension: () => ({js: '.mjs'}),
    dts: {entry},
  },
  {
    ...shared,
    format: ['cjs'],
    outDir: 'dist/cjs',
    clean: false,
    outExtension: () => ({js: '.js'}),
    dts: {entry},
  },
]);
