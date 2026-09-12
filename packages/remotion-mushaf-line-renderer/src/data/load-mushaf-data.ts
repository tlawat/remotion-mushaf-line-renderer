import {resolveSelection} from '../mushaf/registry';
import type {LoadMushafDataOptions} from '../types';
import {loadLayout} from './load-layout';

/**
 * Loads the mushaf data ahead of time — QUL's two exports from Tarteel's CDN, or the `data` source
 * given — so the first line resolves without a round trip. The same load `getMushafLine()` makes,
 * cached once per source, so calling both costs nothing extra; for a `<Player>` (which never runs
 * `calculateMetadata`) call it when the page loads. Pure and Remotion-free, like the resolvers.
 */
export const loadMushafData = async ({mushaf, data}: LoadMushafDataOptions = {}): Promise<void> => {
  const {def} = resolveSelection({mushaf});
  await loadLayout(def.dataset, data);
};
