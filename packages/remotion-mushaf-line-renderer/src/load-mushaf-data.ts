import {loadLayout} from './data/load-layout';
import {DEFAULT_MUSHAF, getMushafDefinition} from './mushafs';
import type {LoadMushafDataOptions} from './types';

/**
 * Loads the mushaf data ahead of time — QUL's two exports from Tarteel's CDN, or the `data` source
 * given — so the first line resolves without a round trip. The same load `getMushafLine()` makes,
 * cached once per source, so calling both costs nothing extra; for a `<Player>` (which never runs
 * `calculateMetadata`) call it when the page loads. Pure and Remotion-free, like the resolvers.
 */
export const loadMushafData = async ({mushaf, data}: LoadMushafDataOptions = {}): Promise<void> => {
  const def = getMushafDefinition(mushaf ?? DEFAULT_MUSHAF);
  await loadLayout(def.dataset, data);
};
