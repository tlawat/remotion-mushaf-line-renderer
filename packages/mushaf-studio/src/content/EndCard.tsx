import {MushafSurahName} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import {surahEnglishName} from '../overlay/surah-names';
import {ayahRangeText, latinRangeText, SMALL_CAPS, smallCapsLabel} from '../overlay/TitleOverlay';
import type {FontProps} from '../schema/fonts';
import {withAlpha} from '../schema/highlight';
import {frameGeometry, SINE, SOFT} from '../schema/tokens';
import {SURAHS} from '../studio/surahs';
import {ChapterInfoCard} from './ChapterInfoCard';
import type {ChapterInfo} from './chapter-info';
import {TafsirCard} from './TafsirCard';
import type {Tafsir} from './tafsir';

/** Where the video's content comes from, for the end card's credit line. */
export type EndCardCredits = {
  /** The Quran text (default `'King Fahd Complex fonts via QUL'`). */
  readonly text?: string | undefined;
  /** The timings: `'qud'` writes "QUD (CC-BY-4.0)", any other text as it is; unset or `null` for none (no audio). */
  readonly timings?: string | null | undefined;
  /** The translation's name (`meta.name`); unset or `null` for none. */
  readonly translation?: string | null | undefined;
};

/** The default source of the Quran text in the credit line. */
export const DEFAULT_TEXT_CREDIT = 'King Fahd Complex fonts via QUL';

/**
 * The end card's credit line, from what the video was made of: "Text: King Fahd Complex fonts via
 * QUL · Timings: QUD (CC-BY-4.0) · Translation: Saheeh International", each part only when there is
 * something to credit (the text always is). Pure.
 */
export const endCardCreditLine = (credits: EndCardCredits = {}): string => {
  const parts = [`Text: ${credits.text?.trim() || DEFAULT_TEXT_CREDIT}`];
  const timings = credits.timings?.trim();
  if (timings) parts.push(`Timings: ${timings.toLowerCase() === 'qud' ? 'QUD (CC-BY-4.0)' : timings}`);
  const translation = credits.translation?.trim();
  if (translation) parts.push(`Translation: ${translation}`);
  return parts.join(' · ');
};

/** The end card's opacity `frame` frames into its sequence: a linear fade from 0 to 1 over `fadeInSeconds`, then 1. */
export const endCardOpacity = (frame: number, fps: number, fadeInSeconds: number): number => {
  const fade = fadeInSeconds * fps;
  if (fade <= 0 || frame >= fade) return 1;
  return frame <= 0 ? 0 : frame / fade;
};

/** Frames the end card's content takes to come in (on `SOFT`), at 30 fps. */
export const END_CARD_IN_FRAMES = 30;
/** Seconds of the end card's last fade to the ground (on `SINE`). */
export const END_CARD_OUT_SECONDS = 1;

/**
 * The end card's content opacity `frame` frames into its `durationInFrames` (render-design.md 5.9):
 * in over 30 frames on `SOFT`, held, and out to the ground over its last second on `SINE`.
 */
export const endCardContentOpacity = (frame: number, fps: number, durationInFrames: number): number => {
  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
  const fadeIn = Math.max(1, Math.round((END_CARD_IN_FRAMES / 30) * fps));
  const fadeOut = Math.max(1, Math.min(Math.round(END_CARD_OUT_SECONDS * fps), durationInFrames - fadeIn));
  const rise = SOFT(clamp01(frame / fadeIn));
  const fall = SINE(clamp01((frame - (durationInFrames - fadeOut)) / fadeOut));
  return Math.round(rise * (1 - fall) * 10_000) / 10_000;
};

/** The framed surah name of the end card's title, when the card is drawn as the render design's. */
export type EndCardTitleGlyph = {
  /** The lines' measure: the framed name spans 30 % of it. */
  readonly measure: number;
  /** The lines' type size and line box: the framed name is set at 30 % of them. */
  readonly glyphSize: number;
  readonly lineHeight: number;
  /** The gold of the hairline and its lozenge (`metalOf()`). */
  readonly metal: string;
  /** The composition's `fontSrc` / `fontFallback`, for the surah-name font. */
  readonly fontProps?: FontProps | undefined;
};

export type EndCardProps = {
  readonly surah: number;
  readonly fromAyah: number;
  readonly toAyah: number;
  /** Shown under the range when not empty. */
  readonly reciter?: string | undefined;
  /** The frame the card starts at, in the parent's time, and how long it stays. */
  readonly from: number;
  readonly durationInFrames: number;
  /** Seconds of the fade-in (default 0.6; 0 for none). Ignored with `glyph`: the content comes in over 30 frames. */
  readonly fadeInSeconds?: number | undefined;
  readonly fontFamily: string;
  /** The weight of the title and credits in `fontFamily` (the design's labels are 500); unset: the font's own. */
  readonly fontWeight?: number | undefined;
  /** The Arabic surah name's family (default `fontFamily`). */
  readonly arabicFontFamily?: string | undefined;
  /** px of the surah name; the rest is in proportion. Ignored with `glyph`, which sizes on the frame's label size. */
  readonly fontSize: number;
  readonly color: string;
  /** The card covers the frame in this colour (with `glyph`, it comes in with the content). */
  readonly background: string;
  /**
   * The render design's card (5.9): the framed surah-name glyph and a gold hairline as the title,
   * the body in the book serif, small-caps credits, the content dissolving in and out on the
   * ground. Unset: the plain card (the English and Arabic names as text).
   */
  readonly glyph?: EndCardTitleGlyph | undefined;
  readonly credits?: EndCardCredits | undefined;
  /**
   * The credits as lines (`attributionLines()` of the video), one under the other, in place of the
   * line `credits` builds. Unset: `endCardCreditLine(credits)`.
   */
  readonly creditLines?: readonly string[] | undefined;
  /** A tafsir card for one ayah of the range, under the title. */
  readonly tafsir?:
    | {readonly tafsir: Tafsir; readonly ayahKey: string; readonly maxLines?: number | undefined}
    | null
    | undefined;
  /** A card about the surah, under the title (after the tafsir card when both are given). */
  readonly chapterInfo?: ChapterInfo | null | undefined;
  readonly style?: React.CSSProperties | undefined;
  readonly className?: string | undefined;
};

type EndCardContentProps = Omit<EndCardProps, 'from'>;

/** The render design's end card: the framed name and hairline once, the body, the credits, dissolving in and out. */
const DesignedEndCard: React.FC<EndCardContentProps & {readonly glyph: EndCardTitleGlyph}> = ({
  surah,
  fromAyah,
  toAyah,
  reciter,
  durationInFrames,
  fontFamily,
  fontWeight,
  arabicFontFamily,
  color,
  background,
  glyph,
  credits,
  creditLines,
  tafsir,
  chapterInfo,
  style,
  className,
}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const {label: L, unit: u} = frameGeometry(width, height);
  const content = endCardContentOpacity(frame, fps, durationInFrames);
  // The ground comes in with the content and stays: the card ends on the bare ground.
  const ground = Math.min(1, SOFT(Math.min(1, Math.max(0, frame / Math.round((END_CARD_IN_FRAMES / 30) * fps)))));
  const nameWidth = Math.round(glyph.measure * 0.3);
  const nameSize = Math.round(glyph.glyphSize * 0.3);
  const nameBox = Math.round(glyph.lineHeight * 0.3);
  const lozenge = Math.round(7 * u);
  const body = Math.round(0.95 * L);
  const bodyStyle: React.CSSProperties = {
    maxWidth: '62ch',
    marginTop: Math.round(0.8 * L),
    opacity: 0.75,
    lineHeight: 1.5,
    textWrap: 'pretty',
  };
  return (
    <div
      className={className ? `mushaf-end-card ${className}` : 'mushaf-end-card'}
      data-mushaf-end-card=""
      style={{position: 'absolute', inset: 0, color, fontFamily, textAlign: 'center', ...style}}
    >
      <div data-mushaf-end-card-part="ground" style={{position: 'absolute', inset: 0, background, opacity: ground}} />
      <div
        data-mushaf-end-card-part="content"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: frameGeometry(width, height).safe,
          boxSizing: 'border-box',
          opacity: content,
        }}
      >
        <div data-mushaf-end-card-part="title" style={{width: nameWidth, height: nameBox}}>
          <MushafSurahName surah={surah} framed fontSize={nameSize} lineHeight={nameBox} {...glyph.fontProps} />
        </div>
        <div
          data-mushaf-end-card-part="rule"
          style={{
            position: 'relative',
            width: Math.round(glyph.measure * 0.18),
            height: Math.max(1, 1.5 * u),
            marginTop: Math.round(0.5 * nameBox),
            marginBottom: Math.round(0.6 * L),
            background: withAlpha(glyph.metal, 0.7),
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: lozenge,
              height: lozenge,
              background: withAlpha(glyph.metal, 0.7),
              transform: 'translate(-50%, -50%) rotate(45deg)',
            }}
          />
        </div>
        <div
          data-mushaf-end-card-part="range"
          style={{...SMALL_CAPS, fontSize: L, fontWeight: fontWeight ?? 500, lineHeight: 1.4, opacity: 0.6}}
        >
          {surahEnglishName(surah)} · {smallCapsLabel(latinRangeText({surah, ayah: fromAyah}, {surah, ayah: toAyah}))}
        </div>
        {reciter?.trim() ? (
          <div
            data-mushaf-end-card-part="reciter"
            style={{
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: Math.round(0.95 * L),
              lineHeight: 1.4,
              opacity: 0.55,
            }}
          >
            {reciter.trim()}
          </div>
        ) : null}
        {tafsir ? (
          <TafsirCard
            tafsir={tafsir.tafsir}
            ayahKey={tafsir.ayahKey}
            maxLines={tafsir.maxLines}
            fontFamily={fontFamily}
            fontSize={body}
            color={color}
            style={{...bodyStyle, fontWeight: 400}}
          />
        ) : null}
        {chapterInfo ? (
          <ChapterInfoCard
            info={chapterInfo}
            showNames={false}
            fontFamily={fontFamily}
            arabicFontFamily={arabicFontFamily}
            fontSize={body}
            color={color}
            style={{...bodyStyle, fontWeight: 400}}
          />
        ) : null}
        <div
          data-mushaf-end-card-part="credits"
          style={{
            ...SMALL_CAPS,
            fontSize: Math.round(0.75 * L),
            fontWeight: fontWeight ?? 500,
            lineHeight: 1.5,
            opacity: 0.55,
            marginTop: Math.round(1.2 * L),
          }}
        >
          {creditLines === undefined
            ? endCardCreditLine(credits)
            : creditLines.map((line) => <div key={line}>{line}</div>)}
        </div>
      </div>
    </div>
  );
};

const EndCardContent: React.FC<EndCardContentProps> = (props) => {
  const {
    surah,
    fromAyah,
    toAyah,
    reciter,
    fadeInSeconds,
    fontFamily,
    arabicFontFamily,
    fontSize,
    color,
    background,
    credits,
    creditLines,
    tafsir,
    chapterInfo,
    style,
    className,
  } = props;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (props.glyph !== undefined) return <DesignedEndCard {...props} glyph={props.glyph} />;
  const arabic = SURAHS[surah - 1]?.arabic;
  const small = fontSize * 0.5;
  return (
    <div
      className={className ? `mushaf-end-card ${className}` : 'mushaf-end-card'}
      data-mushaf-end-card=""
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: fontSize * 0.4,
        padding: fontSize,
        boxSizing: 'border-box',
        background,
        color,
        fontFamily,
        textAlign: 'center',
        opacity: endCardOpacity(frame, fps, fadeInSeconds ?? 0.6),
        ...style,
      }}
    >
      <div data-mushaf-end-card-part="title" style={{fontSize, fontWeight: 700}}>
        {surahEnglishName(surah)}
        {arabic ? (
          <>
            {' '}
            <span
              dir="rtl"
              lang="ar"
              style={{fontFamily: arabicFontFamily ?? fontFamily, fontWeight: 400, unicodeBidi: 'isolate'}}
            >
              {arabic}
            </span>
          </>
        ) : null}
      </div>
      <div data-mushaf-end-card-part="range" style={{fontSize: fontSize * 0.6}}>
        {ayahRangeText(surah, fromAyah, toAyah)}
      </div>
      {reciter?.trim() ? (
        <div data-mushaf-end-card-part="reciter" style={{fontSize: fontSize * 0.5}}>
          {reciter.trim()}
        </div>
      ) : null}
      {tafsir ? (
        <TafsirCard
          tafsir={tafsir.tafsir}
          ayahKey={tafsir.ayahKey}
          maxLines={tafsir.maxLines}
          fontFamily={fontFamily}
          fontSize={small}
          color={color}
          style={{maxWidth: '100%', marginTop: fontSize * 0.4}}
        />
      ) : null}
      {chapterInfo ? (
        <ChapterInfoCard
          info={chapterInfo}
          fontFamily={fontFamily}
          arabicFontFamily={arabicFontFamily}
          fontSize={small}
          color={color}
          style={{maxWidth: '100%', marginTop: fontSize * 0.4}}
        />
      ) : null}
      <div
        data-mushaf-end-card-part="credits"
        style={{fontSize: fontSize * 0.3, opacity: 0.75, marginTop: fontSize * 0.6}}
      >
        {creditLines === undefined
          ? endCardCreditLine(credits)
          : creditLines.map((line) => <div key={line}>{line}</div>)}
      </div>
    </div>
  );
};

/**
 * A closing card, independent of the composition it ends: the surah's name, the range, the reciter,
 * an optional tafsir card of one ayah and/or chapter card, and the credit line built from `credits`
 * (`endCardCreditLine()`) or the lines of `creditLines`, centred over the frame in `background`. It
 * lives in its own `<Sequence>` (`from`, `durationInFrames`, named "End card"). With `glyph` it is
 * the render design's card: the framed surah-name glyph and a gold hairline once as the title, the
 * body in the book serif at most 62 ch wide, small-caps credits, the content coming in over 30
 * frames and going to the ground over the last second. Pure in its props and the frame.
 */
export const EndCard: React.FC<EndCardProps> = ({from, durationInFrames, ...content}) => (
  <Sequence from={from} durationInFrames={durationInFrames} name="End card">
    <EndCardContent {...content} durationInFrames={durationInFrames} />
  </Sequence>
);
