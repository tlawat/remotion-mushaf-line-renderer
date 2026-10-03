import type {MushafRecitationProps} from '../compositions/recitation/schema';
import type {ResolvedRecitation} from '../types';

/** What every tab receives from the dock. */
export type TabProps = {
  readonly compositionId: string;
  readonly props: MushafRecitationProps;
  readonly project: string | undefined;
  /** The composition's frame rate, for `seek()`. */
  readonly fps: number;
};

/** `props.resolved` is `z.any()` in the schema; this is what `calculateMetadata()` puts there. */
export const resolvedOf = (props: MushafRecitationProps): ResolvedRecitation | null =>
  (props.resolved ?? null) as ResolvedRecitation | null;
