// The page's state as plain data, and the pure functions that turn it into a composition's props:
// one transition per step (pick a recitation, set the range, pick a look, set the text files) and
// one builder per composition. The page resolves the props itself (the `<Player>` never runs
// `calculateMetadata()`), so everything here is synchronous and testable without a browser.
import {
  applyLook,
  defaultMushafAyahTextProps,
  defaultMushafRecitationProps,
  type Layout,
  looksFor,
  MUSHAF_LOOKS,
  type MushafAyahTextProps,
  type MushafLook,
  type MushafLookKind,
  type MushafRecitationProps,
  recitationDuration,
  STUDIO_FPS,
  sizeForAspect,
} from '@tlawat/mushaf-studio';
import type {RecitationTimings} from '@tlawat/remotion-mushaf-line';

/** The two compositions the page offers. */
export type WebComposition = 'recitation' | 'ayah-text';

/** A catalogue chapter loaded into memory (`loadCatalogueChapter()`). */
export type PickedRecitation = {
  readonly slug: string;
  /** The reciter's name, in English. */
  readonly reciter: string;
  readonly surah: number;
  /** The catalogue's clip URL: the audio plays from there. */
  readonly audioUrl: string;
  /** The `mem://` URL of the timings. */
  readonly timingsUrl: string;
  /** The first and last ayah the catalogue times in this surah. */
  readonly first: number;
  readonly last: number;
};

export type WebProject = {
  readonly composition: WebComposition;
  readonly recitation: PickedRecitation | null;
  /** The ayahs shown, within the recitation's `first`..`last`. */
  readonly fromAyah: number;
  readonly toAyah: number;
  /** A `MUSHAF_LOOKS` id, or `null` for the composition's defaults. */
  readonly lookId: string | null;
  /** quran.com translation resource id, or `null` for none. */
  readonly translationId: number | null;
  /** `mem://` URLs of the current surah's files, `''` while there is none. */
  readonly translationUrl: string;
  readonly glossUrl: string;
  readonly textUrl: string;
};

export const initialProject: WebProject = {
  composition: 'recitation',
  recitation: null,
  fromAyah: 0,
  toAyah: 0,
  lookId: null,
  translationId: null,
  translationUrl: '',
  glossUrl: '',
  textUrl: '',
};

/**
 * Step 1: a new recitation. The range opens on every ayah it times. A new surah drops the text
 * files of the previous one (the page fetches them again for the new surah); the same surah from
 * another reciter keeps them.
 */
export const pickRecitation = (project: WebProject, recitation: PickedRecitation): WebProject => {
  const sameSurah = project.recitation?.surah === recitation.surah;
  return {
    ...project,
    recitation,
    fromAyah: recitation.first,
    toAyah: recitation.last,
    ...(sameSurah ? {} : {translationUrl: '', glossUrl: '', textUrl: ''}),
  };
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : min));

/**
 * Step 1: the ayah range, clamped to what the recitation times; a `from` past `to` moves `to` with
 * it (and the reverse, when only `to` changed). Unchanged without a recitation.
 */
export const setRange = (project: WebProject, fromAyah: number, toAyah: number): WebProject => {
  const recitation = project.recitation;
  if (!recitation) return project;
  const from = clamp(fromAyah, recitation.first, recitation.last);
  const to = clamp(toAyah, recitation.first, recitation.last);
  if (from <= to) return {...project, fromAyah: from, toAyah: to};
  return from !== project.fromAyah
    ? {...project, fromAyah: from, toAyah: from}
    : {...project, fromAyah: to, toAyah: to};
};

/** The look kind of a composition, as `MUSHAF_LOOKS` names it. */
export const lookKindOf = (composition: WebComposition): MushafLookKind =>
  composition === 'recitation' ? 'recitation' : 'ayah-text';

/** Step 2: the looks offered for the current composition. */
export const looksForProject = (project: WebProject): readonly MushafLook[] =>
  looksFor(lookKindOf(project.composition));

/** The look in effect: the chosen one when it is designed for the composition, else none. */
export const activeLook = (project: WebProject): MushafLook | null => {
  const look = MUSHAF_LOOKS.find((entry) => entry.id === project.lookId);
  return look?.applies.includes(lookKindOf(project.composition)) ? look : null;
};

/** Step 2: pick a look (`null` for the defaults). */
export const setLook = (project: WebProject, lookId: string | null): WebProject => ({...project, lookId});

/** Step 3: the translation; `null` drops it. The URL is the current surah's file, `''` while it loads. */
export const setTranslation = (project: WebProject, translationId: number | null, url = ''): WebProject => ({
  ...project,
  translationId,
  translationUrl: translationId === null ? '' : url,
});

/** Step 3: the word gloss's file, `''` for none. */
export const setGloss = (project: WebProject, url: string): WebProject => ({...project, glossUrl: url});

/** The Quran text file `<MushafAyahText>` reads, `''` while there is none. */
export const setText = (project: WebProject, url: string): WebProject => ({...project, textUrl: url});

/** The preview's switch. */
export const setComposition = (project: WebProject, composition: WebComposition): WebProject => ({
  ...project,
  composition,
});

/** The page's starting style: the data from Tarteel's CDN and the fonts from QUL's (no public/ folder to mirror them in). */
export const baseRecitationProps: MushafRecitationProps = {
  ...defaultMushafRecitationProps,
  audioFile: '',
  timingsFile: '',
  fonts: 'cdn',
  data: 'cdn',
};

export const baseAyahTextProps: MushafAyahTextProps = {
  ...defaultMushafAyahTextProps,
  audioFile: '',
  timingsFile: '',
  textFile: '',
};

const withLook = <P extends Record<string, unknown>>(props: P, project: WebProject): P => {
  const look = activeLook(project);
  return look ? applyLook(props, look) : props;
};

/** `<MushafRecitation>`'s props for the project, `resolved` left `null` for the page to fill. */
export const buildRecitationProps = (project: WebProject): MushafRecitationProps => {
  const styled = withLook(baseRecitationProps, project);
  const recitation = project.recitation;
  return {
    ...styled,
    audioFile: recitation?.audioUrl ?? '',
    timingsFile: recitation?.timingsUrl ?? '',
    fromAyah: recitation ? project.fromAyah : 0,
    toAyah: recitation ? project.toAyah : 0,
    text: {...styled.text, translationFile: project.translationUrl, glossFile: project.glossUrl},
    overlay: {...styled.overlay, reciter: recitation?.reciter ?? ''},
    resolved: null,
  };
};

/** `<MushafAyahText>`'s props for the project (no gloss: the composition shows the ayah translation only). */
export const buildAyahTextProps = (project: WebProject): MushafAyahTextProps => {
  const styled = withLook(baseAyahTextProps, project);
  const recitation = project.recitation;
  return {
    ...styled,
    audioFile: recitation?.audioUrl ?? '',
    timingsFile: recitation?.timingsUrl ?? '',
    fromAyah: recitation ? project.fromAyah : 0,
    toAyah: recitation ? project.toAyah : 0,
    textFile: project.textUrl,
    text: {...styled.text, translationFile: project.translationUrl},
    overlay: {...styled.overlay, reciter: recitation?.reciter ?? ''},
    resolved: null,
  };
};

export type BuiltProps =
  | {readonly composition: 'recitation'; readonly props: MushafRecitationProps}
  | {readonly composition: 'ayah-text'; readonly props: MushafAyahTextProps};

/** The current composition and its props. */
export const buildProps = (project: WebProject): BuiltProps =>
  project.composition === 'recitation'
    ? {composition: 'recitation', props: buildRecitationProps(project)}
    : {composition: 'ayah-text', props: buildAyahTextProps(project)};

/** What the project still needs before it can be resolved, or `null` when nothing. */
export const missingInput = (project: WebProject): string | null => {
  if (!project.recitation) return 'Pick a reciter and a surah to start.';
  if (project.composition === 'ayah-text' && project.textUrl === '') return 'Loading the Quran text…';
  if (project.translationId !== null && project.translationUrl === '') return 'Loading the translation…';
  return null;
};

/** The video's frame rate, size and length: the same numbers `calculateMetadata()` gives. */
export type VideoSpec = {
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly durationInFrames: number;
};

export const videoSpec = (aspect: Layout['aspect'], timings: RecitationTimings): VideoSpec => ({
  fps: STUDIO_FPS,
  ...sizeForAspect(aspect),
  durationInFrames: recitationDuration(timings, STUDIO_FPS),
});

/** The composition id the Studio app declares for each. */
export const compositionId = (composition: WebComposition): 'MushafRecitation' | 'MushafAyahText' =>
  composition === 'recitation' ? 'MushafRecitation' : 'MushafAyahText';

/** A file name stem for the downloads: `mushaf-001-2-7` (surah, from, to). */
export const fileStem = (project: WebProject): string => {
  const recitation = project.recitation;
  if (!recitation) return 'mushaf';
  return `mushaf-${String(recitation.surah).padStart(3, '0')}-${project.fromAyah}-${project.toAyah}`;
};

const CONTENT_KEYS = new Set(['audioFile', 'timingsFile', 'fromAyah', 'toAyah', 'textFile', 'splits', 'resolved']);
const TEXT_FILE_KEYS = new Set(['translationFile', 'glossFile', 'transliterationFile']);
// The machine has the app's mirror and the fonts packages: keep its own defaults for both.
const SOURCE_KEYS = new Set(['fonts', 'data']);

/**
 * The style of the props, for `bun run make --props`: everything but the content (audio, timings,
 * range, the text files) and the data and font sources, which `make` fetches and sets itself.
 */
export const styleProps = (props: MushafRecitationProps | MushafAyahTextProps): Record<string, unknown> => {
  const style: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (CONTENT_KEYS.has(key) || SOURCE_KEYS.has(key)) continue;
    style[key] =
      key === 'text'
        ? Object.fromEntries(Object.entries(value as object).filter(([field]) => !TEXT_FILE_KEYS.has(field)))
        : value;
  }
  return style;
};

/** The props file name `makeCommand()` refers to. */
export const STYLE_FILE = 'mushaf-web.props.json';

/** The `bun run make` line (in apps/mushaf-studio) that renders the same video on a machine. */
export const makeCommand = (project: WebProject): string => {
  const recitation = project.recitation;
  if (!recitation) return 'bun run make --help';
  const parts = [
    'bun run make',
    `--reciter ${recitation.slug}`,
    `--surah ${recitation.surah}`,
    `--from ${project.fromAyah}`,
    `--to ${project.toAyah}`,
    `--composition ${compositionId(project.composition)}`,
    ...(project.translationId === null ? [] : [`--translation ${project.translationId}`]),
    `--props ${STYLE_FILE}`,
  ];
  return parts.join(' ');
};
