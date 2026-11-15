// What the panel shows that the current props make do nothing. Where two options overlap, the
// schema's descriptions say which one wins (the Props sidebar shows them); the panel greys out what
// it shows of the loser and says why, from the props alone. Pure: no store, no Studio.
import {backgroundFor} from '../background/compat';
import type {Background} from '../background/schema';
import type {MessageKey, MessageParams} from './i18n';
import {type EndCardShow, endCardOf, type StudioCompositionProps, textGroupOf} from './tab-props';

/** Why a setting the panel shows has no effect now: a message of the panel's dictionary and its values. */
export type InactiveReason = {readonly key: MessageKey; readonly params: MessageParams};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The ayah translation, while `text.translationPosition` is `'none'`: its files are read but not shown. */
export const translationInactive = (props: StudioCompositionProps): InactiveReason | null =>
  (textGroupOf(props) as {readonly translationPosition?: unknown} | null)?.translationPosition === 'none'
    ? {key: 'inactive.translationHidden', params: {}}
    : null;

/** The word-by-word gloss and transliteration, while `text.glossPosition` is `'none'` (a recitation's only). */
export const wordByWordInactive = (props: StudioCompositionProps): InactiveReason | null =>
  (textGroupOf(props) as {readonly glossPosition?: unknown} | null)?.glossPosition === 'none'
    ? {key: 'inactive.glossHidden', params: {}}
    : null;

/**
 * The end card's saved file for `kind`, while `endCard.show` shows something else: it is not even
 * read. `null` when no file is set (there is nothing to grey out) or the card shows it.
 */
export const endCardFileInactive = (
  props: StudioCompositionProps,
  kind: Extract<EndCardShow, 'tafsir' | 'chapter-info'>,
): InactiveReason | null => {
  const card = endCardOf(props);
  const file = kind === 'tafsir' ? card.tafsirFile : card.chapterInfoFile;
  if (!file) return null;
  const show = card.show ?? 'none';
  return show === kind ? null : {key: 'inactive.endCardFile', params: {show, kind}};
};

/**
 * A look's page colour (`layout.background`), while an image, a video or a gradient covers it
 * (`backgroundFor()`: `background.kind`, or a legacy `layout.backgroundImage`): only what the
 * composition paints itself (the title card, the counter, the end card) still shows it.
 */
export const pageColourInactive = (props: StudioCompositionProps): InactiveReason | null => {
  const {background, layout} = props as {readonly background?: unknown; readonly layout?: unknown};
  if (!isRecord(background) || !isRecord(layout)) return null;
  const painted = backgroundFor(background as Background, {
    background: typeof layout.background === 'string' ? layout.background : '',
    backgroundImage: typeof layout.backgroundImage === 'string' ? layout.backgroundImage : '',
  });
  if (painted.kind === 'color') return null;
  const legacy = background.kind === 'color';
  return {
    key: legacy ? 'inactive.pageColourLegacy' : 'inactive.pageColour',
    params: {kind: painted.kind},
  };
};
