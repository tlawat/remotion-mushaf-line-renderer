import type {ResolvedPage} from '../page/resolve';
import type {MushafPageProps} from '../page/schema';
import {defaultTranslationLayer, MAX_TRANSLATIONS} from '../schema';
import type {AyahTranslation, ResolvedRecitation} from '../types';
import type {ResolvedAyahText} from '../unicode/resolve';
import type {MushafAyahTextProps} from '../unicode/schema';
import type {MushafStudioPanelProps} from './index';
import type {PropsPatch} from './studio-api';

/** The props of a composition that renders the panel: `<MushafRecitation>`'s, `<MushafAyahText>`'s or `<MushafPage>`'s. */
export type StudioCompositionProps = MushafStudioPanelProps['props'];

/** What every tab receives from the dock. */
export type TabProps = {
  readonly compositionId: string;
  readonly props: StudioCompositionProps;
  readonly project: string | undefined;
  /** The composition's frame rate, for `seek()`. */
  readonly fps: number;
};

/**
 * Whether the panel was rendered by `<MushafAyahText>`: its props carry `textFile`, and no printed
 * lines, `splits`, `slice` or `review`.
 */
export const isAyahTextProps = (props: StudioCompositionProps): props is MushafAyahTextProps => 'textFile' in props;

/**
 * Whether the panel was rendered by `<MushafPage>`: its props carry the `pageView` group, and no
 * `text`, `splits` or `slice` (the whole printed page is shown, its lines as printed).
 */
export const isPageProps = (props: StudioCompositionProps): props is MushafPageProps => 'pageView' in props;

/**
 * Which composition rendered the panel, in the vocabulary of `MushafLook.applies`: a page is a
 * recitation's printed lines too (a look's fields the page does not have are skipped).
 */
export const compositionKindOf = (props: StudioCompositionProps): 'recitation' | 'ayah-text' =>
  isAyahTextProps(props) ? 'ayah-text' : 'recitation';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** What `calculateMetadata()` puts in `props.resolved`: a recitation's (lines, schedule), an ayah text's (ayahs) or a page's (pages). */
export type StudioResolved = ResolvedRecitation | ResolvedAyahText | ResolvedPage;

/** `props.resolved` is `z.any()` in every schema; this is what `calculateMetadata()` puts there. */
export const resolvedOf = (props: StudioCompositionProps): StudioResolved | null =>
  (props.resolved ?? null) as StudioResolved | null;

/** Whether `resolved` is a recitation's, with printed lines and their schedule (a page's lines carry no schedule). */
export const hasLines = (resolved: StudioResolved): resolved is ResolvedRecitation => 'schedule' in resolved;

/** Whether `resolved` is a page's: its printed pages and when each is on screen. */
export const isPageResolved = (resolved: StudioResolved): resolved is ResolvedPage => 'pages' in resolved;

/** Whether `resolved` is an ayah text's: its timed ayahs and their Unicode words. */
export const isAyahTextResolved = (resolved: StudioResolved): resolved is ResolvedAyahText => 'ayahs' in resolved;

/**
 * Seconds the composition skips of the recording, already taken off `resolved.timings`: a
 * its `audioOffsetSeconds` (an ayah text has one only when it skips a leading silence); else 0.
 */
export const audioOffsetOf = (resolved: StudioResolved | null): number =>
  resolved !== null && 'audioOffsetSeconds' in resolved ? (resolved.audioOffsetSeconds ?? 0) : 0;

/**
 * The ayah translations `calculateMetadata()` loaded, one per layer (`translations`), else the one
 * `translation`; `[]` for none. For the description's credits.
 */
export const resolvedTranslationsOf = (resolved: StudioResolved | null): readonly AyahTranslation[] => {
  if (resolved === null) return [];
  const view = resolved as {readonly translations?: unknown; readonly translation?: unknown};
  if (Array.isArray(view.translations) && view.translations.length > 0)
    return view.translations as readonly AyahTranslation[];
  return isRecord(view.translation) ? [view.translation as AyahTranslation] : [];
};

/**
 * What a new recording resets besides its files: the ayah range, and the line splits where the
 * composition has them (an ayah text and a page have none, and the key would be written into their Root).
 */
export const freshRecording = (props: StudioCompositionProps): PropsPatch =>
  isAyahTextProps(props) || isPageProps(props) ? {fromAyah: 0, toAyah: 0} : {fromAyah: 0, toAyah: 0, splits: []};

// ---------------------------------------------------------------------------------------------
// The groups the panel reads through `unknown`: fields a composition may not have (a page has no
// `text`), or may not have yet, so the panel never reads one it was not given.

/** One ayah-translation layer of `text.translations`: a file, the font (`'auto'` picks one for its script), size and colour. */
export type TranslationLayer = {
  readonly file: string;
  readonly font: string;
  readonly fontSize: number;
  readonly color: string;
};

/** How many translation layers a composition shows at most (the schema's `MAX_TRANSLATIONS`). */
export const MAX_TRANSLATION_LAYERS = MAX_TRANSLATIONS;

/** What the end card shows: nothing, the credits, the passage's tafsir, or the surah's introduction. */
export type EndCardShow = 'none' | 'credits' | 'tafsir' | 'chapter-info';

/** The `endCard` group as the panel reads and patches it. */
export type EndCardView = {
  readonly show?: EndCardShow | undefined;
  readonly seconds?: number | undefined;
  readonly tafsirFile?: string | undefined;
  readonly chapterInfoFile?: string | undefined;
};

type TextView = {
  readonly translationFile?: unknown;
  readonly glossFile?: unknown;
  readonly transliterationFile?: unknown;
  readonly translationSize?: unknown;
  readonly translationColor?: unknown;
  readonly translations?: unknown;
};

const stringOr = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback);

/** The composition's `text` group, or `null` where it has none (`<MushafPage>`). */
export const textGroupOf = (props: StudioCompositionProps): TextView | null => {
  const text = (props as {readonly text?: unknown}).text;
  return isRecord(text) ? (text as TextView) : null;
};

/** A file field of the `text` group, `''` when the composition has no such field. */
export const textFileOf = (
  props: StudioCompositionProps,
  field: 'translationFile' | 'glossFile' | 'transliterationFile',
): string => stringOr(textGroupOf(props)?.[field], '');

/** Whether the composition takes several translation layers (`text.translations`), not only `text.translationFile`. */
export const hasTranslationLayers = (props: StudioCompositionProps): boolean =>
  Array.isArray(textGroupOf(props)?.translations);

const isLayer = (value: unknown): value is TranslationLayer =>
  isRecord(value) &&
  typeof value.file === 'string' &&
  typeof value.font === 'string' &&
  typeof value.fontSize === 'number' &&
  typeof value.color === 'string';

/** A new layer showing `file`: the font picked for its script, the size and colour of the single translation. */
export const newTranslationLayer = (props: StudioCompositionProps, file: string): TranslationLayer => {
  const text = textGroupOf(props);
  const size = text?.translationSize;
  return {
    file,
    font: 'auto',
    fontSize: typeof size === 'number' ? size : defaultTranslationLayer.fontSize,
    color: stringOr(text?.translationColor, defaultTranslationLayer.color),
  };
};

/**
 * The translation layers the composition shows: `text.translations`, or, while that is empty,
 * `text.translationFile` as the one layer (what the composition itself does). `[]` for none.
 */
export const translationLayersOf = (props: StudioCompositionProps): readonly TranslationLayer[] => {
  const text = textGroupOf(props);
  const layers = Array.isArray(text?.translations) ? text.translations.filter(isLayer) : [];
  if (layers.length > 0) return layers;
  const single = stringOr(text?.translationFile, '');
  return single === '' ? [] : [newTranslationLayer(props, single)];
};

/**
 * The `text` patch that makes `layers` the composition's: the whole list (arrays are replaced, not
 * merged), and `translationFile` kept as the first layer's file, so what reads the single file
 * (and a composition reading it while `translations` is empty) sees the same translation.
 */
export const translationLayersPatch = (layers: readonly TranslationLayer[]): PropsPatch => ({
  text: {translations: layers.map((layer) => ({...layer})), translationFile: layers[0]?.file ?? ''},
});

/** Whether the composition has an end card (`endCard`), which shows a tafsir or the surah's introduction. */
export const hasEndCard = (props: StudioCompositionProps): boolean =>
  isRecord((props as {readonly endCard?: unknown}).endCard);

/** The composition's `endCard` group, `{}` when it has none. */
export const endCardOf = (props: StudioCompositionProps): EndCardView => {
  const card = (props as {readonly endCard?: unknown}).endCard;
  return isRecord(card) ? (card as EndCardView) : {};
};

/** The overlay's reciter, `''` where the composition has no overlay (a page) or names none. */
export const reciterOf = (props: StudioCompositionProps): string => {
  const overlay = (props as {readonly overlay?: unknown}).overlay;
  return isRecord(overlay) ? stringOr(overlay.reciter, '') : '';
};
