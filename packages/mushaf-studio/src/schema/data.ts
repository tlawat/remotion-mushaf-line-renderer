import type {MushafDataSource} from '@tlawat/remotion-mushaf-line';
import {z} from 'zod';

/**
 * Where the mushaf data comes from: QUL's two exports on Tarteel's CDN, or the mirror of them the
 * app ships in `public/data/qpc-v4` (`bun run qul data` writes it). The mirror is the default: it
 * renders offline and byte for byte the same every time.
 */
export const dataSchema = z
  .enum(['cdn', 'mirror'])
  .describe('Where the mushaf data comes from: QUL’s exports on Tarteel’s CDN, or the mirror in public/data/qpc-v4');

export type DataSource = z.infer<typeof dataSchema>;

/** The mirror's two files under `public/`, the names `qul data` writes. */
export const MIRROR_FILES = {words: 'data/qpc-v4/words.json.zip', layout: 'data/qpc-v4/layout.db.zip'} as const;

/**
 * The `data` option of `getMushafLines()` for a data source: `undefined` for the CDN (the package's
 * own default), the mirror's two files through `staticFile()` otherwise, so a Lambda site finds
 * them under its own `publicPath` too.
 */
export const dataSourceFrom = (data: DataSource, staticFile: (path: string) => string): MushafDataSource | undefined =>
  data === 'cdn' ? undefined : {words: staticFile(MIRROR_FILES.words), layout: staticFile(MIRROR_FILES.layout)};
