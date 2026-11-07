import type {Layout} from '../schema';
import {groundOf} from '../schema/color';
import type {Background} from './schema';

/**
 * The background a composition paints, from its `background` group and the two `layout` fields that
 * came before it. `layout.background` stays the page colour: the `'color'` kind paints it (the
 * title card, the counter and the end card use it too), and `background.color` only fills what an
 * image, a video or a gradient leaves. `layout.backgroundImage` is kept for compatibility: props
 * saved before the group existed (kind `'color'`, the image in `layout.backgroundImage`) show their
 * image as they did, and an `'image'` without its own `src` falls back to it. Pure.
 *
 * `backgroundFor(defaultBackground, {background: '#101418', backgroundImage: ''})` paints `#101418`.
 */
export const backgroundFor = (
  background: Background,
  layout: Pick<Layout, 'background' | 'backgroundImage'>,
): Background => {
  if (background.kind === 'color') {
    return layout.backgroundImage === ''
      ? {...background, color: layout.background}
      : {...background, kind: 'image', color: layout.background, src: layout.backgroundImage};
  }
  if (background.kind === 'image' && background.src === '') return {...background, src: layout.backgroundImage};
  return background;
};

/**
 * The colour the marks and the text colours are measured against (`groundOf()`), from what
 * `backgroundFor()` actually paints: props saved with the image in `layout.backgroundImage` (kind
 * `'color'`) sit on that image, so light ink there reads as a dark ground, never as the page colour
 * that the image covers. Pure.
 *
 * `groundFor(defaultBackground, {background: '#f8f3e6', color: '#f1eadb', backgroundImage: 'bg.jpg'})` is charcoal.
 */
export const groundFor = (
  background: Background,
  layout: Pick<Layout, 'background' | 'backgroundImage' | 'color'>,
): string => groundOf(layout, backgroundFor(background, layout).kind);
