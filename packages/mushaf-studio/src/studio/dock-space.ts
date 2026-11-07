import {COLLAPSED_WIDTH, DOCK_WIDTH} from './styles';

/** The element Remotion Studio renders its whole UI into (4.0.521). */
export const STUDIO_CONTAINER_ID = '__remotion-studio-container';

const PROPS = ['position', 'top', 'bottom', 'left', 'right'] as const;

// The reservations alive, and the root's own inline styles from before the first: several docks
// (two slots, a composition remounting) share one root, so it is restored once, when the last goes.
let holders = 0;
let saved: Readonly<Record<string, string>> | null = null;

/**
 * Narrows the Studio's root so the dock sits beside it rather than over its preview. The Studio's
 * UI is absolutely positioned at full size, so the root becomes a fixed box that ends where the
 * dock begins; the Studio sizes its canvas to that box, and the preview recentres in it. Returns the
 * cleanup that releases the reservation. Reservations are counted: the root's own inline styles are
 * kept from the first and restored when the last is released, whatever order they go in, and each
 * new one lays the root out for its dock. Without the root (another Studio version, a test page) it
 * does nothing and the dock stays an overlay.
 */
export const reserveDockSpace = (collapsed: boolean, side: 'left' | 'right'): (() => void) => {
  const root = typeof document === 'undefined' ? null : document.getElementById(STUDIO_CONTAINER_ID);
  if (!root) return () => undefined;
  if (holders === 0) saved = Object.fromEntries(PROPS.map((p) => [p, root.style[p]]));
  holders += 1;
  const room = collapsed ? COLLAPSED_WIDTH : DOCK_WIDTH;
  root.style.position = 'fixed';
  root.style.top = '0px';
  root.style.bottom = '0px';
  root.style.left = side === 'left' ? `${room}px` : '0px';
  root.style.right = side === 'right' ? `${room}px` : '0px';
  // The Studio measures its canvas on window resizes; tell it the box changed.
  window.dispatchEvent(new Event('resize'));
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders > 0) return;
    for (const p of PROPS) root.style[p] = saved?.[p] ?? '';
    saved = null;
    window.dispatchEvent(new Event('resize'));
  };
};

/** How many reservations are alive. For tests. */
export const dockSpaceHolders = (): number => holders;
