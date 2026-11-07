// Contract of the Studio panel (workstream 5): the panel in MushafStudioPanel.tsx, its state in
// store.ts, the Studio API wrappers in studio-api.ts, the tabs in tabs/.
import type {MushafRecitationProps} from '../compositions/recitation/schema';
import type {MushafPageProps} from '../page/schema';
import type {MushafSlotKind} from '../slots/schema';
import type {MushafAyahTextProps} from '../unicode/schema';

/** Which composition the panel edits: `<MushafRecitation>`'s props, `<MushafAyahText>`'s or `<MushafPage>`'s. */
export type MushafStudioPanelKind = MushafSlotKind;

type PanelOptions = {
  /** The id of the `<Composition>` the panel edits, for `saveDefaultProps()` and `goToComposition()`. */
  readonly compositionId: string;
  /** Where the panel's files go, under `public/`: `mushaf-studio/<project>/`. Default: the composition id (`<id>-<propsKey>` in a slot). */
  readonly project?: string | undefined;
  /** Which tab opens first. */
  readonly initialTab?: 'source' | 'look' | 'align' | 'review' | 'lines' | 'text' | undefined;
  /**
   * The key of the composition's `defaultProps` the props live under (a template's drop-in slot):
   * every save goes there and leaves the template's own props alone. The top level when absent.
   */
  readonly propsKey?: string | undefined;
  /**
   * The Studio frame the recitation's frame 0 is at (a slot: the enclosing `<Sequence>`'s start
   * plus the slot's `from`). Every seek adds it, the waveform's playhead subtracts it and the
   * YouTube chapters add `frameOffset / fps`. Default: where the panel is rendered, which is right
   * when it is rendered inside the composition.
   */
  readonly frameOffset?: number | undefined;
  /**
   * How many frames the recitation shows from `frameOffset` (a slot: its box's length, its
   * `durationInFrames` when given): the doubt markers stop there. Default: what the props'
   * resolver left in `resolved.durationInFrames`. Read only with `frameOffset`.
   */
  readonly durationInFrames?: number | undefined;
};

export type MushafStudioPanelProps = PanelOptions &
  (
    | {
        /**
         * The composition's current props (content and style), so the panel shows what the preview shows:
         * `<MushafRecitation>`'s, `<MushafAyahText>`'s (told apart by `textFile`, which only it has) or
         * `<MushafPage>`'s (told apart by `pageView`).
         */
        readonly props: MushafRecitationProps | MushafAyahTextProps | MushafPageProps;
        /** Which composition the props are; told from the props when absent. */
        readonly kind?: MushafStudioPanelKind | undefined;
      }
    | {
        /**
         * `null`: a slot with no recitation yet. The panel opens on Source and shows the kind's empty
         * props (`emptySlotPropsFor()`); the first save writes complete props under `propsKey`.
         */
        readonly props: null;
        readonly kind: MushafStudioPanelKind;
      }
  );

export {isInStudio} from './environment';
export {MushafStudioPanel} from './MushafStudioPanel';
