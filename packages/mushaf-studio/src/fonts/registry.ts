import type {MushafFontPackage} from '@tlawat/remotion-mushaf-line';

/**
 * The fonts packages a project has installed, registered once by the app (`registerMushafFonts()`
 * in its Root), so the studio package never imports them itself: they are optional peers of the
 * main package (43 MB and 51 MB) and a project that renders from QUL's CDN alone needs neither.
 */
export type RegisteredMushafFonts = {
  /** `@tlawat/mushaf-fonts-qpc-v4`, for the `plain` theme. */
  readonly plain?: MushafFontPackage | undefined;
  /** `@tlawat/mushaf-fonts-qpc-v4-tajweed`, for the colour themes. */
  readonly tajweed?: MushafFontPackage | undefined;
};

const KEY = '__mushafStudioFonts';

/** Registers the fonts packages the compositions may fall back to (`fonts: 'fallback'`) or use alone (`fonts: 'package'`). Call it once, at module level, in the Root file. */
export const registerMushafFonts = (fonts: RegisteredMushafFonts): void => {
  (globalThis as Record<string, unknown>)[KEY] = fonts;
};

/** What `registerMushafFonts()` registered, or an empty registration. */
export const getRegisteredMushafFonts = (): RegisteredMushafFonts =>
  ((globalThis as Record<string, unknown>)[KEY] as RegisteredMushafFonts | undefined) ?? {};
