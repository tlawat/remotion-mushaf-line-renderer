import {type RefObject, useCallback, useState} from 'react';
import {useDelayRender, useRemotionEnvironment} from 'remotion';
import {MushafError} from '../../errors';
import type {OnElementImage} from '../Presented';
import {useIsomorphicLayoutEffect} from './use-isomorphic-layout-effect';

const CANVAS_PRESENTATIONS =
  'dissolve, ripple, crosswarp, crossZoom, swap, bookFlip, zoomBlur, dreamyZoom, filmBurn, linearBlur, zoomInOut';
const DOM_PRESENTATIONS =
  'fade(), slide(), wipe(), flip(), clockWipe({width, height}), iris({width, height}), pushCut(), none(), slideFade() or revealRtl()';

const canvasPresentationError = () =>
  new MushafError(
    'CANVAS_PRESENTATION',
    `This presentation captures the scene to a canvas (${CANVAS_PRESENTATIONS}) and needs an exiting scene, so it cannot animate a single entrance. Use ${DOM_PRESENTATIONS}.`,
  );

export type CanvasGuardOptions = {
  /** Whether any presentation is wrapped around the row at all. */
  readonly hasPresentation: boolean;
  readonly rootRef: RefObject<HTMLDivElement | null>;
  readonly rowRef: RefObject<HTMLDivElement | null>;
};

export type CanvasGuard = {
  /** Throw this from render once set. */
  readonly error: MushafError | null;
  /** Passed to every presentation as `onElementImage`. */
  readonly onElementImage: OnElementImage;
};

/**
 * Refuses the presentations of `@remotion/transitions` that paint the scene into a canvas: they
 * need an exiting scene and would capture a blank line. Two detections cover every browser:
 * HTML-in-canvas presentations call `onElementImage` from a DOM paint listener (where a throw would
 * never reach React), and, whether or not paint events fire, they mount the line inside a
 * `<canvas>` — checked before the first paint so no frame is ever captured blank.
 */
export const useCanvasGuard = ({hasPresentation, rootRef, rowRef}: CanvasGuardOptions): CanvasGuard => {
  const {isRendering} = useRemotionEnvironment();
  const {cancelRender} = useDelayRender();
  const [error, setError] = useState<MushafError | null>(null);
  const reject = useCallback(() => {
    // Record the error and throw it from the next render; when rendering, cancel right away.
    const err = canvasPresentationError();
    setError((current) => current ?? err);
    if (isRendering) {
      try {
        cancelRender(err);
      } catch {
        // cancelRender throws by design; the cancellation flag is set.
      }
    }
  }, [isRendering, cancelRender]);
  const onElementImage = useCallback<OnElementImage>(() => reject(), [reject]);
  useIsomorphicLayoutEffect(() => {
    if (!hasPresentation || error) return;
    const root = rootRef.current;
    for (let node = rowRef.current?.parentElement ?? null; node && node !== root; node = node.parentElement) {
      if (node.tagName === 'CANVAS') {
        reject();
        return;
      }
    }
  }, [hasPresentation, error, reject, rootRef, rowRef]);
  return {error, onElementImage};
};
