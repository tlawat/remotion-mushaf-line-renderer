import type {Layout} from '../schema';
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
