import {COLLAPSED_WIDTH, DOCK_WIDTH} from './styles';

/** The element Remotion Studio renders its whole UI into (4.0.521). */
export const STUDIO_CONTAINER_ID = '__remotion-studio-container';

const PROPS = ['width', 'marginLeft', 'marginRight'] as const;

/**
 * Narrows the Studio's root so the dock sits beside it rather than over its preview: the Studio
 * sizes its canvas to its own box, so the preview recentres in what is left. Returns the cleanup
 * that restores the root's own inline styles. Without the root (another Studio version, a test
 * page) it does nothing and the dock stays an overlay.
 */
export const reserveDockSpace = (collapsed: boolean, side: 'left' | 'right'): (() => void) => {
  const root = typeof document === 'undefined' ? null : document.getElementById(STUDIO_CONTAINER_ID);
  if (!root) return () => undefined;
  const before = Object.fromEntries(PROPS.map((p) => [p, root.style[p]]));
  const room = collapsed ? COLLAPSED_WIDTH : DOCK_WIDTH;
  root.style.width = `calc(100% - ${room}px)`;
  root.style[side === 'right' ? 'marginRight' : 'marginLeft'] = `${room}px`;
  // The Studio measures its canvas on window resizes; tell it the box changed.
  window.dispatchEvent(new Event('resize'));
  return () => {
    for (const p of PROPS) root.style[p] = before[p] ?? '';
    window.dispatchEvent(new Event('resize'));
  };
};
