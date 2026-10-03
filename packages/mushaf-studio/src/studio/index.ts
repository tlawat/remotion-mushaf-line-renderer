// Contract of the Studio panel (workstream 5): the panel in MushafStudioPanel.tsx, its state in
// store.ts, the Studio API wrappers in studio-api.ts, the tabs in tabs/.
import type {MushafRecitationProps} from '../compositions/recitation/schema';

export type MushafStudioPanelProps = {
  /** The id of the `<Composition>` the panel edits, for `saveDefaultProps()` and `goToComposition()`. */
  readonly compositionId: string;
  /** The composition's current props (content and style), so the panel shows what the preview shows. */
  readonly props: MushafRecitationProps;
  /** Where the panel's files go, under `public/`: `mushaf-studio/<project>/`. Default `'default'`. */
  readonly project?: string | undefined;
  /** Which tab opens first. */
  readonly initialTab?: 'source' | 'align' | 'review' | 'lines' | 'text' | undefined;
};

export {isInStudio} from './environment';
export {MushafStudioPanel} from './MushafStudioPanel';
