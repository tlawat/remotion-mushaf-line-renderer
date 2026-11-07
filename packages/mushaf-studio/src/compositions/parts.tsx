// The parts every composition paints from what `./extras` resolved: the translation stack with its
// web fonts, the volume curve of the `<Audio>`, the tajweed legend in its band,
// the end card and the Studio-only warnings. Pure in their props and the frame.
import {Audio as MediaAudio} from '@remotion/media';
import type {MushafThemeSelection} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {Audio, useRemotionEnvironment} from 'remotion';
import {OWN_AUDIO_NAME} from '../audio/host';
import type {AudioSettings} from '../audio/schema';
import type {VolumeCurve} from '../audio/volume';
import {EndCard} from '../content/EndCard';
import {
  directionOfLanguage,
  fontFamilyForLanguage,
  SCRIPT_FONTS,
  type ScriptId,
  scriptOfLanguage,
  useWebFonts,
  type WebFontRequest,
} from '../content/script-fonts';
import {TajweedLegend} from '../content/TajweedLegend';
import {tajweedLegend, themeHasTajweedColors} from '../content/tajweed';
import {attributionLines} from '../export/description';
import {translationCredit} from '../overlay/TitleOverlay';
import type {EndCardSettings, Legend} from '../schema';
import {readableInk} from '../schema/color';
import {ARABIC_LABEL_FAMILY, BOOK_SERIF, type FontProps, studioFontFamily, studioFontStyle} from '../schema/fonts';
import {frameGeometry} from '../schema/tokens';
import {textAdvance} from '../translations/fit';
import type {TranslationLayer} from '../translations/TranslationStack';
import type {AyahTranslation, ResolvedAudio, ResolvedEndCard, StudioTimings} from '../types';
import {isAutoFont, type TranslationLayerSpec, type TranslationTextProps, translationLayerSpecs} from './extras';
import {BOOK_SERIF_REQUEST} from './fonts';
import {type BlockReserve, WARNING_STYLE} from './shared';
import {passageSpan, surahOfAyah} from './timings';

// ---------------------------------------------------------------------------------------------
// Translations

/** The script whose web fonts include `family` (a single family name, as `SCRIPT_FONTS` lists it), else `null`. */
const scriptOfFamily = (family: string): ScriptId | null => {
  const name = family.trim().replace(/^(['"])(.*)\1$/, '$2');
  for (const fonts of Object.values(SCRIPT_FONTS)) if (fonts.families.includes(name)) return fonts.script;
  return null;
};

/** A web font family as a CSS `font-family`: quoted, then a generic family. */
const withGeneric = (family: string): string =>
  `${JSON.stringify(family)}, ${/sans/i.test(family) ? 'sans-serif' : 'serif'}`;

/** The weight every translation is set in (EB Garamond 500 for Latin scripts). */
export const TRANSLATION_WEIGHT = 500;

/** What the stack needs of one layer: its CSS family and direction, and the web font to load for it (if any). */
export type PlannedLayer = {
  readonly layer: TranslationLayer;
  readonly request: WebFontRequest | null;
};

/**
 * One translation layer as the stack paints it: `'auto'` takes the web font of the file's language
 * (`fontFamilyForLanguage()`), loaded from Google Fonts in its script's subsets (a CJK family with
 * the layer's own characters as `text`); a family `SCRIPT_FONTS` lists is loaded the same way; any
 * other font is a CSS family used as it is. The direction is the language's, except for the
 * `translationFile` layer, which keeps `translationDirection`. Pure.
 */
export const planTranslationLayer = (spec: TranslationLayerSpec, translation: AyahTranslation): PlannedLayer => {
  const language = translation.meta.language;
  const auto = isAutoFont(spec.font);
  const family = auto ? fontFamilyForLanguage(language) : spec.font;
  const script = auto ? scriptOfLanguage(language) : scriptOfFamily(spec.font);
  const direction = spec.direction === 'language' ? directionOfLanguage(language) : spec.direction;
  let request: WebFontRequest | null = null;
  if (script !== null) {
    const name = family.trim().replace(/^(['"])(.*)\1$/, '$2');
    const subsets = SCRIPT_FONTS[script].subsets;
    // The book serif is the Studio's own request (useStudioFonts()), its 500 included: one load.
    request =
      name === BOOK_SERIF
        ? BOOK_SERIF_REQUEST
        : subsets === undefined
          ? {family: name, text: Object.values(translation.text).join('')}
          : {family: name, subsets};
  }
  return {
    layer: {
      translation,
      fontFamily: request === null ? family : withGeneric(request.family),
      fontSize: spec.fontSize,
      // The design's weight: EB Garamond 500; a font without it takes its nearest.
      fontWeight: TRANSLATION_WEIGHT,
      color: spec.color,
      direction,
    },
    request,
  };
};

/**
 * The layers of a `<TranslationStack>`: the translations `calculateMetadata()` loaded (one per spec
 * of `translationLayerSpecs(text)`, in order), each typed as its spec says; a translation with no
 * spec (a `resolved` made from other props) takes the `translation*` fields. Every web font they use
 * is loaded through one `useWebFonts()` call, which the render waits for. `[]` for no translation.
 */
export const useTranslationLayers = (
  text: TranslationTextProps,
  translations: readonly AyahTranslation[],
): readonly TranslationLayer[] => {
  const specs = translationLayerSpecs(text);
  const fallback: TranslationLayerSpec = {
    file: '',
    font: text.translationFont,
    fontSize: text.translationSize,
    color: text.translationColor,
    direction: text.translationDirection,
    prop: 'translationFile',
  };
  const planned = translations.map((translation, i) => planTranslationLayer(specs[i] ?? fallback, translation));
  const requests: WebFontRequest[] = [];
  const seen = new Set<string>();
  for (const {request} of planned) {
    if (request === null) continue;
    const key = JSON.stringify(request);
    if (!seen.has(key)) {
      seen.add(key);
      requests.push(request);
    }
  }
  useWebFonts(requests);
  return planned.map((p) => p.layer);
};

/**
 * The layers as drawn on `ground`: a colour that reads under 4.5:1 there gives way to the ink mixed
 * a third into the ground (`readableInk()`), so a muted translation never fades into the page. The
 * saved colours are not touched. The same array when every colour already reads.
 */
export const readableLayers = (
  layers: readonly TranslationLayer[],
  ink: string,
  ground: string,
): readonly TranslationLayer[] =>
  layers.every((layer) => readableInk(layer.color, ink, ground) === layer.color)
    ? layers
    : layers.map((layer) => ({...layer, color: readableInk(layer.color, ink, ground)}));

/** The size a translation is drawn at under lines of glyph size `glyphSize`: never more than half the Arabic. */
export const cappedTranslationSize = (size: number, glyphSize: number): number =>
  Math.min(size, Math.floor(0.5 * glyphSize));

/**
 * The layers as drawn under the lines: each colour readable on `ground` (`readableLayers()`) and
 * each size capped at half the Arabic glyph (`cappedTranslationSize()`: 36 px stays 36 at 16:9, the
 * cap is 26 at 9:16). The same array when nothing changes.
 */
export const drawnTranslationLayers = (
  layers: readonly TranslationLayer[],
  options: {readonly ink: string; readonly ground: string; readonly glyphSize: number},
): readonly TranslationLayer[] => {
  const readable = readableLayers(layers, options.ink, options.ground);
  return readable.every((layer) => cappedTranslationSize(layer.fontSize, options.glyphSize) === layer.fontSize)
    ? readable
    : readable.map((layer) => ({...layer, fontSize: cappedTranslationSize(layer.fontSize, options.glyphSize)}));
};

/**
 * The translations of a `resolved`: its `translations`, or for one made before them, its single
 * `translation`.
 */
export const translationsOf = (resolved: {
  readonly translations?: readonly AyahTranslation[] | undefined;
  readonly translation?: AyahTranslation | null | undefined;
}): readonly AyahTranslation[] => resolved.translations ?? (resolved.translation ? [resolved.translation] : []);

// ---------------------------------------------------------------------------------------------
// Audio

/**
 * The volume curve of the composition's audio: the gain `calculateMetadata()` found (1 without an
 * analysis) times `audio.volume`, faded in from the composition's first frame and out to the last
 * frame before the end card (`contentFrames`), silent after it.
 */
export const volumeCurveFor = (
  audio: Pick<AudioSettings, 'fadeInSeconds' | 'fadeOutSeconds' | 'volume'>,
  analysis: ResolvedAudio | undefined,
  contentFrames: number,
  fps: number,
): VolumeCurve => ({
  gain: analysis?.gain ?? 1,
  fadeIn: audio.fadeInSeconds,
  fadeOut: audio.fadeOutSeconds,
  durationInFrames: contentFrames,
  fps,
  volume: audio.volume,
});

export type CompositionAudioProps = {
  readonly src: string;
  /** Frames of the file skipped at the start, and where it stops (`<Audio>`'s). */
  readonly trimBefore?: number | undefined;
  readonly trimAfter?: number | undefined;
  /** The volume at a frame of the `<Audio>` (0 where it starts): `volumeAt()` of the composition's curve. */
  readonly volume: (frame: number) => number;
};

/**
 * The composition's `<Audio>`: `remotion`'s in the Studio, a `<Player>` and a server render, and
 * `@remotion/media`'s under the in-browser web renderer (`renderMediaOnWeb()`, which announces
 * `isClientSideRendering`), where `remotion`'s throws. The same props either way, and the same
 * `name` (`OWN_AUDIO_NAME`), which the Studio's timeline shows and by which the Mushaf panel leaves
 * the composition's own track out of the template's tracks.
 */
export const CompositionAudio: React.FC<CompositionAudioProps> = ({src, trimBefore, trimAfter, volume}) => {
  const {isClientSideRendering} = useRemotionEnvironment();
  const trims = {
    ...(trimBefore === undefined ? {} : {trimBefore}),
    ...(trimAfter === undefined ? {} : {trimAfter}),
  };
  return isClientSideRendering ? (
    <MediaAudio src={src} volume={volume} name={OWN_AUDIO_NAME} {...trims} />
  ) : (
    <Audio src={src} volume={volume} name={OWN_AUDIO_NAME} {...trims} />
  );
};

/** A composition's props with the panel option: what `<MushafRecitation>`, `<MushafAyahText>` and `<MushafPage>` take. */
export type WithPanelOption<P> = P & {
  /**
   * Whether the composition docks the Mushaf panel in the Studio's preview (default `true`). A
   * drop-in slot (`<MushafRecitationSlot>`) passes `false` and docks it beside its `<Sequence>`,
   * so the panel stays on every frame of the template.
   */
  readonly panel?: boolean | undefined;
};

// ---------------------------------------------------------------------------------------------
// Tajweed legend

const LEGEND_NAMES = {en: 'english', ar: 'arabic', both: 'both'} as const;

/** Where a legend's band sits and how much of the frame it keeps from the lines. */
export type LegendBandGeometry = {
  /** `top` for `top-*` positions, `bottom` for `bottom-*`. */
  readonly edge: 'top' | 'bottom';
  /** px from that edge to the band: the safe area, or at 9:16 the platform band; inside the jadwal's inner rule when one is drawn. */
  readonly inset: number;
  /** px of the names: `0.8 L`, or less when the widest entry would not fit in the safe area's width. */
  readonly fontSize: number;
  /** Rows the entries wrap to in the band's width. */
  readonly rows: number;
  /** px each row takes, entries and the 1 em between them: each at most the safe area's width. */
  readonly rowWidths: readonly number[];
  /** px of the band: `1.6 × fontSize` a row. */
  readonly height: number;
  /** px kept clear of the lines from that edge: the band, the inset beyond the safe area, and half a line box. */
  readonly reserve: number;
};

/** The legend's English names as `<TajweedLegend band>` sets them: small caps, 0.08 em apart. */
const LEGEND_LETTER_SPACING = 0.08;

/** What `legendBand()` measures a legend in: the frame, the lines' line box, and the Latin names' face. */
export type LegendBandFrame = {
  readonly width: number;
  readonly height: number;
  readonly lineHeight: number;
  /** The English names' family (`studioFontFamily(overlay.font, 'label')`); default the `'auto'` label face. */
  readonly fontFamily?: string | undefined;
  /** The frame draws the jadwal (`layout.frame: 'hairline'`): the band goes inside its inner rule. Default `false`. */
  readonly jadwal?: boolean | undefined;
};

/**
 * The band of the tajweed legend in a `width` × `height` frame (render-design.md 5.8), or `null`
 * when no legend is drawn (`legend.show` off, or a theme that paints every rule alike). Its entries
 * are measured as `<TajweedLegend band>` draws them (the English names in small caps, letter-spaced,
 * in `fontFamily`; the Arabic in Amiri; on a canvas, after the font gate) and wrapped into the
 * width inside the safe area. An entry is one unbreakable unit, so when the widest one is wider
 * than that (the long prolongation rule with both names at 9:16), the names are drawn smaller until
 * it fits. The band is `1.6 × fontSize` a row, and the lines keep the band plus half a line box
 * (`lineHeight`) clear of it.
 */
export const legendBand = (
  legend: Pick<Legend, 'show' | 'position' | 'names'>,
  theme: MushafThemeSelection,
  frame: LegendBandFrame,
): LegendBandGeometry | null => {
  if (!legend.show || !themeHasTajweedColors(theme)) return null;
  const geometry = frameGeometry(frame.width, frame.height, {jadwal: frame.jadwal});
  // The reserve counts from the bare safe area, as the lines' own margins do.
  const {safe} = frameGeometry(frame.width, frame.height);
  const labelSize = Math.round(0.8 * geometry.label);
  const edge = legend.position.startsWith('top') ? 'top' : 'bottom';
  const inset = edge === 'top' ? geometry.top : geometry.bottom;
  const room = frame.width - 2 * geometry.safe;
  const latin = {
    fontFamily: frame.fontFamily ?? studioFontFamily('auto', 'label'),
    fontWeight: 500,
    smallCaps: true,
    letterSpacing: LEGEND_LETTER_SPACING,
  };
  const arabic = {fontFamily: ARABIC_LABEL_FAMILY};
  // Each entry at the label size: a swatch of 0.5 em, 0.4 em before each name.
  const entries = tajweedLegend(theme).map((item) => {
    let entry = 0.5 * labelSize;
    if (legend.names !== 'ar') entry += 0.4 * labelSize + textAdvance(item.english, latin, labelSize);
    if (legend.names !== 'en') entry += 0.4 * labelSize + textAdvance(item.arabic, arabic, labelSize);
    return entry;
  });
  // An entry never breaks: the widest one sets the size when it would not fit at 0.8 L.
  const widest = Math.max(0, ...entries);
  const fontSize = widest > room ? Math.max(1, Math.floor((labelSize * room) / widest)) : labelSize;
  const scale = fontSize / labelSize;
  const rowWidths: number[] = [];
  for (const entry of entries.map((width) => width * scale)) {
    const used = rowWidths[rowWidths.length - 1];
    if (used !== undefined && used + fontSize + entry <= room)
      rowWidths[rowWidths.length - 1] = used + fontSize + entry;
    else rowWidths.push(entry);
  }
  const rows = Math.max(1, rowWidths.length);
  const height = Math.round(rows * 1.6 * fontSize);
  return {
    edge,
    inset,
    fontSize,
    rows,
    rowWidths,
    height,
    reserve: inset - safe + height + Math.round(0.5 * frame.lineHeight),
  };
};

/** The bands `blockGeometry()` keeps clear of the lines for the legend (`legendBand()`): nothing without one. */
export const legendReserve = (
  legend: Pick<Legend, 'show' | 'position' | 'names'>,
  theme: MushafThemeSelection,
  frame: LegendBandFrame,
): BlockReserve => {
  const band = legendBand(legend, theme, frame);
  if (band === null) return {top: 0, bottom: 0};
  return band.edge === 'top' ? {top: band.reserve, bottom: 0} : {top: 0, bottom: band.reserve};
};

export type LegendBandProps = {
  readonly legend: Legend;
  readonly theme: MushafThemeSelection;
  /** The Latin names' family (`studioFontFamily(overlay.font, 'label')`); the Arabic names are in Amiri. */
  readonly fontFamily: string;
  /** The names' ink: drawn at 60 %, as every label. */
  readonly color: string;
  readonly width: number;
  readonly height: number;
  /** The lines' line box, for the gap `legendBand()` keeps. */
  readonly lineHeight: number;
  /** The frame draws the jadwal: the band goes inside its inner rule. Default `false`. */
  readonly jadwal?: boolean | undefined;
};

/**
 * The tajweed legend (`<TajweedLegend band>`) as one centred row in its band above or below the
 * lines (`legendBand()`), with no card behind it: the composition fits the lines around the band
 * (`legendReserve()`), so it never covers the text. Nothing when no legend is drawn.
 */
export const LegendBand: React.FC<LegendBandProps> = ({
  legend,
  theme,
  fontFamily,
  color,
  width,
  height,
  lineHeight,
  jadwal,
}) => {
  const band = legendBand(legend, theme, {width, height, lineHeight, fontFamily, jadwal});
  if (band === null) return null;
  const {safe} = frameGeometry(width, height, {jadwal});
  return (
    <div
      data-mushaf-block="Tajweed legend"
      style={{
        position: 'absolute',
        left: safe,
        right: safe,
        [band.edge]: band.inset,
        height: band.height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.6,
      }}
    >
      <TajweedLegend
        theme={theme}
        band
        names={LEGEND_NAMES[legend.names]}
        fontFamily={fontFamily}
        arabicFontFamily={ARABIC_LABEL_FAMILY}
        fontSize={band.fontSize}
        color={color}
        style={{fontWeight: 500}}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// End card

/**
 * The credits of a video, one line each (`attributionLines()`): the fonts, the QUD timings when the
 * sidecar says so, and every translation shown, as "Translation of the meanings · <name>", unless
 * the intro card already credited it (`translationCredited`).
 */
export const endCardCreditLines = (
  timings: StudioTimings,
  translations: readonly AyahTranslation[],
  options: {readonly translationCredited?: boolean | undefined} = {},
): readonly string[] => {
  const base = attributionLines({timings});
  if (translations.length === 0 || options.translationCredited === true) return base;
  const lines = [...base, ...translations.map((t) => translationCredit(t.meta.name))];
  return [...new Set(lines)];
};

export type CompositionEndCardProps = {
  readonly endCard: EndCardSettings;
  readonly content: ResolvedEndCard | undefined;
  readonly timings: StudioTimings;
  readonly translations: readonly AyahTranslation[];
  /** The intro card credited the translation: the end card's credits leave it out. Default `false`. */
  readonly translationCredited?: boolean | undefined;
  readonly reciter: string;
  /** The frame the card starts at: once the lines have faded. */
  readonly from: number;
  readonly durationInFrames: number;
  /** `overlay.font`: `'auto'` (EB Garamond) or a CSS font family. */
  readonly font: string;
  readonly color: string;
  /** The ground the card is drawn on. */
  readonly background: string;
  /** The gold of the title's hairline (`metalOf()`). */
  readonly metal: string;
  /** The lines' measure, type size and line box: the framed surah name is sized on them. */
  readonly measure: number;
  readonly glyphSize: number;
  readonly lineHeight: number;
  readonly fontProps?: FontProps | undefined;
  readonly width: number;
  readonly height: number;
};

/**
 * The composition's end card (`<EndCard glyph>`) over the frames `calculateMetadata()` added after
 * the lines' fade: the framed surah name and a gold hairline, the range recited, the reciter, the
 * tafsir of the last ayah or the surah's introduction when `endCard.show` asks for them, and the
 * credits. Nothing for `'none'`. A recitation across surahs ends on its last surah: the card names
 * it and the ayahs of it recited (`<EndCard>` names one surah).
 */
export const CompositionEndCard: React.FC<CompositionEndCardProps> = ({
  endCard,
  content,
  timings,
  translations,
  translationCredited,
  reciter,
  from,
  durationInFrames,
  font,
  color,
  background,
  metal,
  measure,
  glyphSize,
  lineHeight,
  fontProps,
  width,
  height,
}) => {
  if (endCard.show === 'none' || durationInFrames <= 0) return null;
  const {to} = passageSpan(timings);
  // The first ayah recited of the last surah: the file's first, for one surah.
  const firstIndex = timings.ayat.findIndex((_, i) => surahOfAyah(timings, i) === to.surah);
  const first = timings.ayat[firstIndex]!.ayah;
  const last = to.ayah;
  const tafsir = endCard.show === 'tafsir' ? (content?.tafsir ?? null) : null;
  const face = studioFontStyle(font, 'label');
  return (
    <EndCard
      surah={to.surah}
      fromAyah={first}
      toAyah={last}
      reciter={reciter}
      from={from}
      durationInFrames={durationInFrames}
      fontFamily={face.fontFamily}
      {...(face.fontWeight === undefined ? {} : {fontWeight: face.fontWeight})}
      arabicFontFamily={ARABIC_LABEL_FAMILY}
      fontSize={Math.round(Math.min(width, height) * 0.06)}
      color={color}
      background={background}
      glyph={{measure, glyphSize, lineHeight, metal, fontProps}}
      creditLines={endCardCreditLines(timings, translations, {translationCredited})}
      tafsir={tafsir ? {tafsir, ayahKey: `${to.surah}:${last}`, maxLines: 8} : null}
      chapterInfo={endCard.show === 'chapter-info' ? (content?.chapterInfo ?? null) : null}
    />
  );
};

// ---------------------------------------------------------------------------------------------
// Studio warnings

/**
 * The one-line notices of the Studio (a fonts mode that degraded to the CDN, an audio that could
 * not be analysed), one under the other at the top of the frame. The caller shows it in the Studio
 * only (`useInStudio()`); nothing when there is nothing to say.
 */
export const StudioWarnings: React.FC<{readonly warnings: readonly (string | null | undefined)[]}> = ({warnings}) => {
  const lines = warnings.filter((w): w is string => typeof w === 'string' && w !== '');
  if (lines.length === 0) return null;
  return (
    <div data-mushaf-warnings="" style={{position: 'absolute', top: 0, left: 0, right: 0}}>
      {lines.map((line) => (
        <div key={line} style={{...WARNING_STYLE, position: 'relative'}}>
          Mushaf Studio: {line}
        </div>
      ))}
    </div>
  );
};
