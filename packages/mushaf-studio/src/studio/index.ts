// Contract of the Studio panel (workstream 5). Implement MushafStudioPanel.tsx, store.ts,
// studio-api.ts and tabs/*; keep these exports and signatures.
import type * as React from 'react';
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

/**
 * The Mushaf panel: rendered inside a composition, it renders nothing outside the Studio (in a
 * render, a `<Player>`, on the server). In the Studio it portals a dock into `document.body`, with
 * the tabs Source, Align, Review, Lines and Text. Every change it makes goes through the same path:
 * write the file(s) into `public/`, `saveDefaultProps()` on the composition, then
 * `reevaluateComposition()`. It never calls `delayRender()` and does not re-render with the frame.
 */
export const MushafStudioPanel: React.FC<MushafStudioPanelProps> = () => {
  throw new Error('MushafStudioPanel is not implemented yet (workstream 5).');
};

/** `true` inside Remotion Studio's preview (not while rendering, not in a Player, not on a server). */
export const isInStudio = (): boolean => {
  throw new Error('isInStudio is not implemented yet (workstream 5).');
};
