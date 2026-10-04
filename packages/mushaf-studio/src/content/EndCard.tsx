import type * as React from 'react';
import {Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import {surahEnglishName} from '../overlay/surah-names';
import {ayahRangeText} from '../overlay/TitleOverlay';
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

export type EndCardProps = {
  readonly surah: number;
  readonly fromAyah: number;
  readonly toAyah: number;
  /** Shown under the range when not empty. */
  readonly reciter?: string | undefined;
  /** The frame the card starts at, in the parent's time, and how long it stays. */
  readonly from: number;
  readonly durationInFrames: number;
  /** Seconds of the fade-in (default 0.6; 0 for none). */
  readonly fadeInSeconds?: number | undefined;
  readonly fontFamily: string;
  /** The Arabic surah name's family (default `fontFamily`). */
  readonly arabicFontFamily?: string | undefined;
  /** px of the surah name; the rest is in proportion. */
  readonly fontSize: number;
  readonly color: string;
  /** The card covers the frame in this colour. */
  readonly background: string;
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

type EndCardContentProps = Omit<EndCardProps, 'from' | 'durationInFrames'>;

const EndCardContent: React.FC<EndCardContentProps> = ({
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
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
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
 * A closing card, independent of the composition it ends: the surah's name in English and Arabic,
 * the range ("1:1–7"), the reciter, an optional tafsir card of one ayah and/or chapter card, and
 * the credit line built from `credits` (`endCardCreditLine()`) or the lines of `creditLines`, centred over the frame in
 * `background`. It lives in its own `<Sequence>` (`from`, `durationInFrames`, named "End card") and
 * fades in over its first `fadeInSeconds`. Pure in its props and the frame.
 */
export const EndCard: React.FC<EndCardProps> = ({from, durationInFrames, ...content}) => (
  <Sequence from={from} durationInFrames={durationInFrames} name="End card">
    <EndCardContent {...content} />
  </Sequence>
);
