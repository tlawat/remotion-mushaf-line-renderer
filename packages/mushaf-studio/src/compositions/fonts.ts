// The web fonts of every text the Studio sets around the lines: EB Garamond for the translation,
// the gloss and the labels, Amiri for the Arabic labels. Loaded once, through `useWebFonts()` and its
// `delayRender()` gate, so no frame is taken in a fallback face (render-design.md 5.5).
import {SCRIPT_FONTS, useWebFonts, type WebFontRequest, type WebFontsState} from '../content/script-fonts';
import {ARABIC_LABEL_FONT, BOOK_SERIF} from '../schema/fonts';

/**
 * The faces `useStudioFonts()` loads: EB Garamond 400, 400 italic and 500 in the Latin, Cyrillic,
 * Greek and Vietnamese subsets, and Amiri 400 in Arabic and Latin. `planTranslationLayer()` asks for
 * the same EB Garamond request, so the two share one load.
 */
export const STUDIO_FONT_REQUESTS: readonly WebFontRequest[] = [
  {family: BOOK_SERIF, weights: [400, 500], italics: [400], subsets: SCRIPT_FONTS.latin.subsets},
  {family: ARABIC_LABEL_FONT, weights: [400], subsets: SCRIPT_FONTS.arabic.subsets},
];

/** The EB Garamond request of `STUDIO_FONT_REQUESTS`. */
export const BOOK_SERIF_REQUEST: WebFontRequest = STUDIO_FONT_REQUESTS[0]!;

/**
 * Loads the Studio's book serif and Arabic label font (`STUDIO_FONT_REQUESTS`) and keeps the render
 * waiting until both are in `document.fonts`. Every composition calls it once; `ready` says whether
 * the faces are in (always on the server). A failed load cancels the render with its `MushafError`.
 */
export const useStudioFonts = (): WebFontsState => useWebFonts(STUDIO_FONT_REQUESTS);
