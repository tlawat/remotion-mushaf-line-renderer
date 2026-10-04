import type {ResolvedRecitation} from '../types';
import type {ResolvedAyahText} from '../unicode/resolve';
import type {MushafAyahTextProps} from '../unicode/schema';
import type {MushafStudioPanelProps} from './index';
import type {PropsPatch} from './studio-api';

/** The props of a composition that renders the panel: `<MushafRecitation>`'s or `<MushafAyahText>`'s. */
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

/** Which composition rendered the panel, in the vocabulary of `MushafLook.applies`. */
export const compositionKindOf = (props: StudioCompositionProps): 'recitation' | 'ayah-text' =>
  isAyahTextProps(props) ? 'ayah-text' : 'recitation';

/** What `calculateMetadata()` puts in `props.resolved`: a recitation's (lines, schedule) or an ayah text's (ayahs). */
export type StudioResolved = ResolvedRecitation | ResolvedAyahText;

/** `props.resolved` is `z.any()` in both schemas; this is what `calculateMetadata()` puts there. */
export const resolvedOf = (props: StudioCompositionProps): StudioResolved | null =>
  (props.resolved ?? null) as StudioResolved | null;

/** Whether `resolved` is a recitation's, with printed lines and their schedule. */
export const hasLines = (resolved: StudioResolved): resolved is ResolvedRecitation => 'lines' in resolved;

/**
 * Seconds the composition skips of the recording, already taken off `resolved.timings`: a
 * recitation's `audioOffsetSeconds`; 0 for an ayah text, whose timings are the file's own.
 */
export const audioOffsetOf = (resolved: StudioResolved | null): number =>
  resolved !== null && hasLines(resolved) ? resolved.audioOffsetSeconds : 0;

/**
 * What a new recording resets besides its files: the ayah range, and the line splits where the
 * composition has them (an ayah text has none, and the key would be written into its Root).
 */
export const freshRecording = (props: StudioCompositionProps): PropsPatch =>
  isAyahTextProps(props) ? {fromAyah: 0, toAyah: 0} : {fromAyah: 0, toAyah: 0, splits: []};
