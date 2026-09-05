import {MushafError} from '../errors';
import type {DatasetId} from '../mushafs';
import type {CompiledLayout} from './format';

/**
 * One literal, relative dynamic import per dataset. A literal `import()` is the one form that the
 * Remotion bundler (webpack, `publicPath` `./` locally and `/sites/<id>/` on Lambda), Vite, Node
 * ESM/CJS and vitest all handle identically, and it keeps the ~1 MB data module out of the main
 * chunk: it is fetched once per browser tab, only when a line is resolved at runtime.
 */
const DATASETS: Record<DatasetId, () => Promise<CompiledLayout | null>> = {
  'qpc-v4': () => import('./qpc-v4.generated').then((m) => m.layout),
};

const cache = new Map<DatasetId, Promise<CompiledLayout>>();

export const loadLayout = (id: DatasetId): Promise<CompiledLayout> => {
  let pending = cache.get(id);
  if (!pending) {
    pending = DATASETS[id]()
      .then((layout) => {
        if (!layout) {
          throw new MushafError(
            'DATA_NOT_COMPILED',
            `The layout data for "${id}" has not been compiled. Run \`node scripts/fetch-qul.mjs\` in the repository and commit src/data/${id}.generated.ts.`,
            {dataset: id},
          );
        }
        return layout;
      })
      .catch((e: unknown) => {
        cache.delete(id);
        if (e instanceof MushafError) throw e;
        throw new MushafError('DATA_LOAD_FAILED', `Could not load layout data for "${id}": ${e instanceof Error ? e.message : String(e)}`, {dataset: id, cause: e});
      });
    cache.set(id, pending);
  }
  return pending;
};

/** Test hook: forget cached datasets (also used after a failed load). */
export const resetLayoutCache = (): void => {
  cache.clear();
};
