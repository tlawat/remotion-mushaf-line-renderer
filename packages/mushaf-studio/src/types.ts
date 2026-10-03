import type {LineSchedule, MushafLineData, RecitationTimings} from '@tlawat/remotion-mushaf-line';

/**
 * Where a printed line of a passage is split into two timed segments: the line, and the first
 * word (`MushafWord.wordId`) of its second segment. Applied by `applySplits()`: the line appears
 * twice in the passage, once with the words before `atWordId` and once from it on, each a slot of
 * its own in `scheduleLines()`.
 */
export type LineSplit = {
  readonly page: number;
  readonly line: number;
  readonly atWordId: number;
};

/**
 * One segment of the aligner's output, as the studio records it next to the timings: the
 * aligner's own vocabulary, with times made recording-relative. Confidence is a property of the
 * segment (the aligner gives none per word).
 */
export type AlignmentSegment = {
  readonly segment: number;
  /** Seconds from the start of the recording. */
  readonly timeFrom: number;
  readonly timeTo: number;
  /** "surah:ayah:word" of the first and last matched word; `null` for isti'adha, basmala or no match. */
  readonly refFrom: string | null;
  readonly refTo: string | null;
  /** 0-1. */
  readonly confidence: number;
  readonly hasMissingWords: boolean;
  readonly hasRepeatedWords: boolean;
  /** The aligner's error for a segment it could not match, else `null`. */
  readonly error: string | null;
  /** The Uthmani text the segment was matched to, else `null`. */
  readonly matchedText: string | null;
  /** The aligner's `kind` (`'quran'`, ...) when it gives one. */
  readonly kind?: string;
};

/** One recited word as the aligner heard it: its id, its Uthmani text and the segment it sits in. One entry per occurrence. */
export type AlignmentWord = {
  readonly id: string;
  readonly text: string;
  readonly segment: number;
  readonly start: number;
  readonly end: number;
};

/** A change the user made to the timings in the panel, kept so a file says where its numbers come from. */
export type AlignmentEdit = {
  readonly kind: 'nudge' | 'split-segment' | 'realign' | 'trim';
  /** ISO 8601, written by the panel (never during a render). */
  readonly at: string;
  readonly note: string;
};

/** Where the recitation came from when it was picked from the aligner's catalogue. */
export type CatalogueOrigin = {
  readonly slug: string;
  readonly chapter: number;
  readonly verseFrom: number;
  readonly verseTo: number;
  /** Seconds into the chapter audio at which the clip starts. */
  readonly clipStart: number;
  readonly audioUrl: string;
};

/**
 * What the studio writes next to `RecitationTimings` under the `alignment` key, which the main
 * package ignores: enough to show confidence in the Review tab, to name words by their text, to
 * resume a session (`audioId`) and to say how the file was made.
 */
export type AlignmentSidecar = {
  readonly version: 1;
  readonly source: 'qud' | 'qud-catalogue' | 'file' | 'manual';
  readonly audioId?: string;
  readonly model?: string;
  readonly device?: string;
  readonly riwayah?: string;
  readonly recitation?: CatalogueOrigin;
  readonly segments: readonly AlignmentSegment[];
  readonly words: readonly AlignmentWord[];
  readonly edits: readonly AlignmentEdit[];
};

/**
 * The timings file the studio reads and writes: the package's format, the three informational keys
 * the example's producers write (`audio`, `durationSeconds`, `source`), and the sidecar.
 */
export type StudioTimings = RecitationTimings & {
  /** The recording the times refer to: a `public/` path or a URL. */
  readonly audio?: string;
  readonly durationSeconds?: number;
  /** Which tool wrote the file and how. */
  readonly source?: string;
  readonly alignment?: AlignmentSidecar;
};

/** Why a word is doubtful, for the Review tab and the in-preview marks. */
export type DoubtReason = 'low-confidence' | 'missing-words' | 'segment-error' | 'incomplete-ayah' | 'repeated';

/** Who or what wrote a translation and under which terms. */
export type TranslationMeta = {
  /** A stable id: QUL's or quran.com's resource id when known (`'qul:131'`, `'quran.com:20'`), else a name. */
  readonly id: string;
  readonly name: string;
  /** ISO 639-1 where possible (`'en'`), else the source's own name. */
  readonly language: string;
  /** Where the data came from: `'qul'`, `'quran.com'`, `'file'`. */
  readonly source: string;
  readonly license?: string;
};

/** An ayah-by-ayah translation: plain text per `"surah:ayah"`, footnote markers stripped. */
export type AyahTranslation = {
  readonly kind: 'ayah';
  readonly meta: TranslationMeta;
  readonly text: Readonly<Record<string, string>>;
};

/** A word-by-word gloss (a translation or a transliteration): text per `"surah:ayah:word"`. */
export type WordGloss = {
  readonly kind: 'word';
  readonly meta: TranslationMeta;
  readonly words: Readonly<Record<string, string>>;
};

export type Translation = AyahTranslation | WordGloss;

/** What `calculateMetadata()` of `<MushafRecitation>` resolves once per render from the content props. */
export type ResolvedRecitation = {
  readonly timings: StudioTimings;
  /** The passage's lines, splits applied, in reading order. */
  readonly lines: readonly MushafLineData[];
  readonly schedule: readonly LineSchedule[];
  readonly translation: AyahTranslation | null;
  readonly gloss: WordGloss | null;
  /** Word ids the Review tab marks, with their reasons. */
  readonly doubtful: Readonly<Record<string, readonly DoubtReason[]>>;
};
