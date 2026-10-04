import {getMushafLines, type MushafLineData} from '@tlawat/remotion-mushaf-line';
import {type CalculateMetadataFunction, staticFile as remotionStaticFile} from 'remotion';
import {MushafStudioError} from '../../errors';
import {ayahRangeText, surahEnglishName} from '../../overlay';
import {dataSourceFrom, themeSelectionFrom} from '../../schema';
import {ayahCount} from '../../studio/surahs';
import {type MushafThumbnailProps, THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH} from './schema';

/** What `calculateMushafThumbnailMetadata()` resolves: the printed line the thumbnail shows. */
export type ResolvedThumbnail = {
  /** The first line that carries `fromAyah`, sliced to that ayah's words. */
  readonly line: MushafLineData;
};

/** The subtitle shown: `subtitle`, or when empty the surah and its range ("Al-Fatihah · 1:2–7"; `toAyah` 0 is the surah's last). */
export const thumbnailSubtitle = (
  props: Pick<MushafThumbnailProps, 'surah' | 'fromAyah' | 'toAyah' | 'subtitle'>,
): string => {
  if (props.subtitle !== '') return props.subtitle;
  const toAyah = props.toAyah === 0 ? Math.max(props.fromAyah, ayahCount(props.surah)) : props.toAyah;
  return `${surahEnglishName(props.surah)} · ${ayahRangeText(props.surah, props.fromAyah, toAyah)}`;
};

/**
 * Resolves the thumbnail's line: the first printed line of `fromAyah`, sliced to it, in the
 * thumbnail's theme and from its data source. `BAD_STUDIO_PROP` when `toAyah` is before `fromAyah`
 * or the ayah has no line.
 */
export const resolveThumbnail = async (
  props: MushafThumbnailProps,
  options: {readonly staticFile?: ((path: string) => string) | undefined} = {},
): Promise<ResolvedThumbnail> => {
  if (props.toAyah !== 0 && props.toAyah < props.fromAyah) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      `toAyah (${props.toAyah}) is before fromAyah (${props.fromAyah}). Set toAyah to ${props.fromAyah} or later, or to 0 for the end of the surah.`,
      {prop: 'toAyah', fromAyah: props.fromAyah, toAyah: props.toAyah},
    );
  }
  const lines = await getMushafLines({
    surah: props.surah,
    fromAyah: props.fromAyah,
    toAyah: props.fromAyah,
    slice: true,
    theme: themeSelectionFrom(props.theme, props.customTheme),
    data: dataSourceFrom(props.data, options.staticFile ?? remotionStaticFile),
  });
  const line = lines[0];
  if (line === undefined) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      `Ayah ${props.surah}:${props.fromAyah} has no printed line. Pick an ayah of the surah for fromAyah.`,
      {prop: 'fromAyah', surah: props.surah, fromAyah: props.fromAyah},
    );
  }
  return {line};
};

/**
 * `calculateMetadata` for `<Still id="MushafThumbnail">`: `resolved` (`resolveThumbnail()`) and the
 * thumbnail's 1280×720.
 */
export const calculateMushafThumbnailMetadata: CalculateMetadataFunction<MushafThumbnailProps> = async ({props}) => ({
  props: {...props, resolved: await resolveThumbnail(props)},
  width: THUMBNAIL_WIDTH,
  height: THUMBNAIL_HEIGHT,
});
