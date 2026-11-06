// The one file that reads Remotion's `Internals`: they are not public API and change between
// versions. Every accessor checks that what it reads is there and has the shape it expects, and
// falls back to "nothing" (an empty record, frame 0, no sequences) instead of throwing, so a Remotion
// upgrade degrades the panel rather than the composition. The shapes read are pinned by
// test/unit/studio/remotion-internals.test.tsx.
import {type Context, createContext, useContext, useMemo} from 'react';
import {Internals} from 'remotion';

/** The live Root values by composition id: what the Studio's preview and its Props sidebar show. */
export type LiveEditorProps = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

/** A sequence of the Studio's timeline, as the panel reads it (a host's `<Audio>` or `<Video>` track, say). */
export type TimelineSequence = {
  readonly id: string;
  /** The `name` the sequence was given, else its component's name. */
  readonly displayName: string;
  /** `'sequence'`, `'audio'`, `'video'` or `'image'`; whatever a later Remotion adds is passed on as it is. */
  readonly type: string;
  /** The media's URL for an audio, video or image track; `null` for a plain sequence. */
  readonly src: string | null;
  /** The composition frame the sequence starts at. */
  readonly from: number;
  readonly durationInFrames: number;
  /** The id of the enclosing sequence; `null` at the top. */
  readonly parent: string | null;
  /** The frame of the media heard at the sequence's frame 0 (`startFrom`/`trimBefore`); 0 when none. */
  readonly startMediaFrom: number;
  /** The media's playback rate, else the sequence's own; 1 when neither is known. */
  readonly playbackRate: number;
  /** Whether the timeline draws it looping. */
  readonly loop: boolean;
};

const internals = Internals as unknown as Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isContext = (value: unknown): value is Context<unknown> =>
  isRecord(value) && 'Provider' in value && 'Consumer' in value;

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const NO_PROPS: LiveEditorProps = Object.freeze({});
const NO_SEQUENCES: readonly TimelineSequence[] = Object.freeze([]);

// Chosen once, so every render calls the same hooks in the same order whatever Remotion provides.
const missingContext = createContext<unknown>(null);
const editorPropsContext = isContext(internals.EditorPropsContext) ? internals.EditorPropsContext : missingContext;
const sequenceContext = isContext(internals.SequenceContext) ? internals.SequenceContext : missingContext;
const useNoSequences = (): unknown => NO_SEQUENCES;
const useSequences: () => unknown =
  typeof internals.useSequenceManagerSequences === 'function'
    ? (internals.useSequenceManagerSequences as () => unknown)
    : useNoSequences;

/**
 * The `props` record of an `EditorPropsContext` value: only the entries that are objects, the same
 * record (so the same identity) when all of them are. `{}` for anything else.
 */
export const editorPropsOf = (value: unknown): LiveEditorProps => {
  const props = isRecord(value) ? value.props : undefined;
  if (!isRecord(props)) return NO_PROPS;
  const entries = Object.entries(props);
  if (entries.every(([, entry]) => isRecord(entry))) return props as LiveEditorProps;
  return Object.fromEntries(entries.filter(([, entry]) => isRecord(entry))) as LiveEditorProps;
};

/**
 * The live Root values by composition id: `Internals.EditorPropsContext`'s `props`, which the Studio
 * refreshes from the Root file after every write (the panel's, the Props sidebar's, its undo), and
 * which the preview renders. `composition.defaultProps` (the `savedDefaultProps` of
 * `saveDefaultProps()`) is the Root as the page loaded it: the Studio writes the Root without
 * rebuilding the bundle. An entry is missing until the Studio has read that composition's props;
 * `{}` outside the Studio or when Remotion has no such context.
 */
export const useLiveEditorProps = (): LiveEditorProps => editorPropsOf(useContext(editorPropsContext));

/**
 * The absolute frame a `Internals.SequenceContext` value starts at: `absoluteFrom`, else
 * `cumulatedFrom + relativeFrom` (older Remotion), else 0 (no enclosing `<Sequence>`).
 */
export const sequenceStartOf = (value: unknown): number => {
  if (!isRecord(value)) return 0;
  if (isFiniteNumber(value.absoluteFrom)) return value.absoluteFrom;
  if (isFiniteNumber(value.cumulatedFrom) && isFiniteNumber(value.relativeFrom))
    return value.cumulatedFrom + value.relativeFrom;
  return 0;
};

/** The composition frame the enclosing `<Sequence>` starts at; 0 at the top of a composition. */
export const useOwnSequenceStart = (): number => sequenceStartOf(useContext(sequenceContext));

/** One registered sequence as the panel reads it; `null` for an entry without an id. */
export const timelineSequenceOf = (value: unknown): TimelineSequence | null => {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const media = value.type === 'audio' || value.type === 'video';
  const rate = media ? value.playbackRate : value.sequencePlaybackRate;
  return {
    id: value.id,
    displayName: typeof value.displayName === 'string' ? value.displayName : '',
    type: typeof value.type === 'string' ? value.type : 'sequence',
    src: typeof value.src === 'string' ? value.src : null,
    from: isFiniteNumber(value.from) ? value.from : 0,
    durationInFrames: isFiniteNumber(value.duration) ? value.duration : 0,
    parent: typeof value.parent === 'string' ? value.parent : null,
    startMediaFrom: media && isFiniteNumber(value.startMediaFrom) ? value.startMediaFrom : 0,
    playbackRate: isFiniteNumber(rate) ? rate : 1,
    loop: isRecord(value.loopDisplay),
  };
};

/** The sequences of a registry snapshot, each read by `timelineSequenceOf()`; `[]` for anything but a list. */
export const timelineSequencesOf = (value: unknown): readonly TimelineSequence[] => {
  if (!Array.isArray(value) || value.length === 0) return NO_SEQUENCES;
  return value.map(timelineSequenceOf).filter((entry): entry is TimelineSequence => entry !== null);
};

/**
 * The sequences on the Studio's timeline (`Internals.useSequenceManagerSequences()`), the host's
 * audio and video tracks among them. Studio only: elsewhere Remotion registers none, and `[]` is
 * what this returns.
 */
export const useTimelineSequences = (): readonly TimelineSequence[] => {
  const snapshot = useSequences();
  return useMemo(() => timelineSequencesOf(snapshot), [snapshot]);
};
