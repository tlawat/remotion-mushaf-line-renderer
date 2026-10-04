// The parts every composition paints from what `./extras` resolved: the translation stack with its
// web fonts, the volume curve of the `<Audio>`, the glow's level, the tajweed legend in a corner,
// the end card and the Studio-only warnings. Pure in their props and the frame.
import {Audio as MediaAudio} from '@remotion/media';
import type {MushafThemeSelection} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {Audio, useRemotionEnvironment} from 'remotion';
import type {AudioSettings} from '../audio/schema';
import {levelAt, type VolumeCurve} from '../audio/volume';
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
import {themeHasTajweedColors} from '../content/tajweed';
import {attributionLines} from '../export/description';
import type {EndCardSettings, Legend} from '../schema';
import type {TranslationLayer} from '../translations/TranslationStack';
import type {AyahTranslation, ResolvedAudio, ResolvedEndCard, StudioTimings} from '../types';
import {isAutoFont, type TranslationLayerSpec, type TranslationTextProps, translationLayerSpecs} from './extras';
import {WARNING_STYLE} from './shared';

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
    request =
      subsets === undefined ? {family: name, text: Object.values(translation.text).join('')} : {family: name, subsets};
  }
  return {
    layer: {
      translation,
      fontFamily: request === null ? family : withGeneric(request.family),
      fontSize: spec.fontSize,
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
 * `isClientSideRendering`), where `remotion`'s throws. The same props either way.
 */
export const CompositionAudio: React.FC<CompositionAudioProps> = ({src, trimBefore, trimAfter, volume}) => {
  const {isClientSideRendering} = useRemotionEnvironment();
  const trims = {
    ...(trimBefore === undefined ? {} : {trimBefore}),
    ...(trimAfter === undefined ? {} : {trimAfter}),
  };
  return isClientSideRendering ? (
    <MediaAudio src={src} volume={volume} {...trims} />
  ) : (
    <Audio src={src} volume={volume} {...trims} />
  );
};

/** The glow's level at `audioSeconds` of the recording's clock (`audioClock()`): `levelAt()` of the levels, 0 without them. */
export const glowLevelAt = (analysis: ResolvedAudio | undefined, audioSeconds: number, fps: number): number =>
  analysis === undefined || analysis.levels.length === 0 ? 0 : levelAt(analysis.levels, audioSeconds * fps);

// ---------------------------------------------------------------------------------------------
// Tajweed legend

const LEGEND_NAMES = {en: 'english', ar: 'arabic', both: 'both'} as const;

/** The legend's corner, `inset` px from the edges. */
const cornerStyle = (position: Legend['position'], inset: number): React.CSSProperties => ({
  position: 'absolute',
  ...(position.startsWith('top') ? {top: inset} : {bottom: inset}),
  ...(position.endsWith('left') ? {left: inset} : {right: inset}),
});

export type CornerLegendProps = {
  readonly legend: Legend;
  readonly theme: MushafThemeSelection;
  readonly fontFamily: string;
  readonly color: string;
  /** The page colour, behind the legend so it reads over the lines. */
  readonly background: string;
  /** The composition's width: the legend's size follows it. */
  readonly width: number;
};

/**
 * The tajweed legend (`<TajweedLegend>`) in a corner, on a card of the page colour, sized to the
 * frame (a fortieth of its width per name). Nothing when `legend.show` is off or the theme paints
 * every rule alike (`themeHasTajweedColors()`).
 */
export const CornerLegend: React.FC<CornerLegendProps> = ({legend, theme, fontFamily, color, background, width}) => {
  if (!legend.show || !themeHasTajweedColors(theme)) return null;
  const fontSize = Math.max(14, Math.round(width / 80));
  return (
    <div
      data-mushaf-block="Tajweed legend"
      style={{
        ...cornerStyle(legend.position, Math.round(width * 0.02)),
        padding: `${Math.round(fontSize * 0.5)}px ${Math.round(fontSize * 0.7)}px`,
        borderRadius: Math.round(fontSize * 0.4),
        background,
        maxWidth: Math.round(width * 0.45),
      }}
    >
      <TajweedLegend
        theme={theme}
        orientation={legend.orientation}
        names={LEGEND_NAMES[legend.names]}
        fontFamily={fontFamily}
        arabicFontFamily={ARABIC_FAMILY}
        fontSize={fontSize}
        color={color}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// End card

/** The Arabic texts of the cards (the surah's name, the rules' names): a Naskh where there is one. */
const ARABIC_FAMILY = '"Amiri", "Noto Naskh Arabic", "Scheherazade New", serif';

/**
 * The credits of a video, one line each (`attributionLines()`): the fonts, the QUD timings when the
 * sidecar says so, and every translation shown.
 */
export const endCardCreditLines = (
  timings: StudioTimings,
  translations: readonly AyahTranslation[],
): readonly string[] => {
  if (translations.length === 0) return attributionLines({timings});
  const lines = translations.flatMap((t) =>
    attributionLines({timings, translationName: t.meta.name, translationSource: t.meta.source}),
  );
  return [...new Set(lines)];
};

export type CompositionEndCardProps = {
  readonly endCard: EndCardSettings;
  readonly content: ResolvedEndCard | undefined;
  readonly timings: StudioTimings;
  readonly translations: readonly AyahTranslation[];
  readonly reciter: string;
  /** The frame the card starts at: the end of the recitation. */
  readonly from: number;
  readonly durationInFrames: number;
  readonly fontFamily: string;
  readonly color: string;
  readonly background: string;
  readonly width: number;
  readonly height: number;
};

/**
 * The composition's end card (`<EndCard>`) over the frames `calculateMetadata()` added: the surah,
 * the range recited, the reciter, the credits, and the tafsir of the last ayah or the surah's
 * introduction when `endCard.show` asks for them. Nothing for `'none'`.
 */
export const CompositionEndCard: React.FC<CompositionEndCardProps> = ({
  endCard,
  content,
  timings,
  translations,
  reciter,
  from,
  durationInFrames,
  fontFamily,
  color,
  background,
  width,
  height,
}) => {
  if (endCard.show === 'none' || durationInFrames <= 0) return null;
  const first = timings.ayat[0]!.ayah;
  const last = timings.ayat[timings.ayat.length - 1]!.ayah;
  const tafsir = endCard.show === 'tafsir' ? (content?.tafsir ?? null) : null;
  return (
    <EndCard
      surah={timings.surah}
      fromAyah={first}
      toAyah={last}
      reciter={reciter}
      from={from}
      durationInFrames={durationInFrames}
      fontFamily={fontFamily}
      arabicFontFamily={ARABIC_FAMILY}
      fontSize={Math.round(Math.min(width, height) * 0.06)}
      color={color}
      background={background}
      creditLines={endCardCreditLines(timings, translations)}
      tafsir={tafsir ? {tafsir, ayahKey: `${timings.surah}:${last}`, maxLines: 8} : null}
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
