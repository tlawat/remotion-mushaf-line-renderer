import {COLLAPSED_WIDTH, DOCK_WIDTH} from './styles';

/** The element Remotion Studio renders its whole UI into (4.0.521). */
export const STUDIO_CONTAINER_ID = '__remotion-studio-container';

const PROPS = ['position', 'top', 'bottom', 'left', 'right'] as const;

/**
 * Narrows the Studio's root so the dock sits beside it rather than over its preview. The Studio's
 * UI is absolutely positioned at full size, so the root becomes a fixed box that ends where the
 * dock begins; the Studio sizes its canvas to that box, and the preview recentres in it. Returns the cleanup
 * that restores the root's own inline styles. Without the root (another Studio version, a test
 * page) it does nothing and the dock stays an overlay.
 */
export const reserveDockSpace = (collapsed: boolean, side: 'left' | 'right'): (() => void) => {
  const root = typeof document === 'undefined' ? null : document.getElementById(STUDIO_CONTAINER_ID);
  if (!root) return () => undefined;
  const before = Object.fromEntries(PROPS.map((p) => [p, root.style[p]]));
  const room = collapsed ? COLLAPSED_WIDTH : DOCK_WIDTH;
  root.style.position = 'fixed';
  root.style.top = '0px';
  root.style.bottom = '0px';
  root.style.left = side === 'left' ? `${room}px` : '0px';
  root.style.right = side === 'right' ? `${room}px` : '0px';
  // The Studio measures its canvas on window resizes; tell it the box changed.
  window.dispatchEvent(new Event('resize'));
  return () => {
    for (const p of PROPS) root.style[p] = before[p] ?? '';
    window.dispatchEvent(new Event('resize'));
  };
};
