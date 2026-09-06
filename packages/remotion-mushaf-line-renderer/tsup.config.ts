import type {Plugin} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {defineConfig, type Options} from 'tsup';

/**
 * Output layout (deterministic file names, no hashes, so Lambda `publicPath` bundles and README
 * instructions can name them):
 *
 *   dist/esm/index.mjs (+ index.d.mts)                    dist/cjs/index.js (+ index.d.ts)
 *   dist/esm/presentations/<name>.mjs (+ .d.mts)          dist/cjs/presentations/<name>.js (+ .d.ts)
 *   dist/esm/data/qpc-v4.mjs                              dist/cjs/data/qpc-v4.js        (~1 MB, ASCII, lazy)
 *
 * The data module is its own entry. In src/data/load-layout.ts it is reached through one literal
 * `import('./qpc-v4.generated')`; the ESM build rewrites that specifier to `./data/qpc-v4.mjs`
 * (kept as a real dynamic import, which webpack, Vite and Node all split into a lazy chunk) and the
 * CJS build turns it into a lazy `require('./data/qpc-v4.js')` so the CommonJS file needs no ESM
 * support from its host (Jest, Node's vm, older tooling). Either way the main chunk stays small and
 * the data is loaded once per tab, only when a line is resolved at runtime.
 */
const entry = {
  index: 'src/index.ts',
  'presentations/reveal-rtl': 'src/presentations/reveal-rtl.tsx',
  'presentations/slide-fade': 'src/presentations/slide-fade.tsx',
  'data/qpc-v4': 'src/data/qpc-v4.generated.ts',
};
const dtsEntry = {
  index: entry.index,
  'presentations/reveal-rtl': entry['presentations/reveal-rtl'],
  'presentations/slide-fade': entry['presentations/slide-fade'],
};

const LOADER_FILE = /[\\/]src[\\/]data[\\/]load-layout\.ts$/;
const SOURCE_IMPORT = "import('./qpc-v4.generated')";

const esmDataChunk: Plugin = {
  name: 'mushaf-data-chunk-esm',
  setup(build) {
    build.onResolve({filter: /^\.\/qpc-v4\.generated$/}, (args) => {
      if (args.kind !== 'dynamic-import') return null; // the entry itself resolves normally
      return {path: './data/qpc-v4.mjs', external: true};
    });
  },
};

const cjsDataChunk: Plugin = {
  name: 'mushaf-data-chunk-cjs',
  setup(build) {
    build.onLoad({filter: LOADER_FILE}, async (args) => {
      const source = await readFile(args.path, 'utf8');
      if (!source.includes(SOURCE_IMPORT)) throw new Error(`${args.path}: expected the literal ${SOURCE_IMPORT}`);
      return {contents: source.replace(SOURCE_IMPORT, "Promise.resolve().then(() => require('./data/qpc-v4.js'))"), loader: 'ts'};
    });
    build.onResolve({filter: /^\.\/data\/qpc-v4\.js$/}, () => ({path: './data/qpc-v4.js', external: true}));
  },
};

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
    options.charset = 'ascii'; // word texts stay `\uFCxx` escapes; no encoding surprises in any bundler
  },
};

export default defineConfig([
  {
    ...shared,
    format: ['esm'],
    outDir: 'dist/esm',
    clean: true,
    outExtension: () => ({js: '.mjs'}),
    dts: {entry: dtsEntry},
    esbuildPlugins: [esmDataChunk],
  },
  {
    ...shared,
    format: ['cjs'],
    platform: 'node', // plain `require()` for the data chunk instead of esbuild's browser shim
    outDir: 'dist/cjs',
    clean: false,
    outExtension: () => ({js: '.js'}),
    dts: {entry: dtsEntry},
    esbuildPlugins: [cjsDataChunk],
  },
]);
