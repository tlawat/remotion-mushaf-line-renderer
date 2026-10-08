import {MushafSurahName} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {FontProps, Overlay} from '../schema';
import {surahEnglishName} from './surah-names';

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';

/** Latin digits as Arabic-Indic ones, everything else as it is: `arabicIndicDigits('1:7')` is "١:٧". */
export const arabicIndicDigits = (text: string): string =>
  text.replace(/[0-9]/g, (digit) => ARABIC_INDIC[Number(digit)]!);

/** "1:2–7" for a range, "1:2" for one ayah; `'arabic'` writes the same in Arabic-Indic digits ("١:٢–٧"). */
export const ayahRangeText = (
  surah: number,
  fromAyah: number,
  toAyah: number,
  digits: 'latin' | 'arabic' = 'latin',
): string => {
  const text = fromAyah === toAyah ? `${surah}:${fromAyah}` : `${surah}:${fromAyah}–${toAyah}`;
  return digits === 'latin' ? text : arabicIndicDigits(text);
};

/**
 * The range from one ayah to another, across surahs when they differ: `"113:4–114:2"`; within one
 * surah it is `ayahRangeText()` (`"1:2–7"`, `"1:2"`). `'arabic'` writes the same in Arabic-Indic digits.
 */
export const ayahSpanText = (
  from: {readonly surah: number; readonly ayah: number},
  to: {readonly surah: number; readonly ayah: number},
  digits: 'latin' | 'arabic' = 'latin',
): string => {
  if (from.surah === to.surah) return ayahRangeText(from.surah, from.ayah, to.ayah, digits);
  const text = `${from.surah}:${from.ayah}–${to.surah}:${to.ayah}`;
  return digits === 'latin' ? text : arabicIndicDigits(text);
};

/** The transliterated name of a surah, or of the first and last of a passage across surahs: `"Al-Falaq – An-Nas"`. */
export const surahSpanName = (fromSurah: number, toSurah: number = fromSurah): string =>
  fromSurah === toSurah ? surahEnglishName(fromSurah) : `${surahEnglishName(fromSurah)} – ${surahEnglishName(toSurah)}`;

/** How long before the first word the intro card is gone, when the recitation starts inside `introSeconds`. */
export const INTRO_CLEARANCE_SECONDS = 0.3;
/** The intro card's fade-out, at most: a shorter card fades over its whole length. */
export const INTRO_FADE_SECONDS = 0.5;

/**
 * When the intro card is gone, in seconds: `introSeconds`, or `INTRO_CLEARANCE_SECONDS` before the
 * first word when that comes earlier (never below 0). `firstWordSeconds` is `null` where nothing is
 * heard (a passage without audio): the card then stays its full length.
 */
export const introEndSeconds = (introSeconds: number, firstWordSeconds: number | null): number =>
  firstWordSeconds === null
    ? introSeconds
    : Math.max(0, Math.min(introSeconds, firstWordSeconds - INTRO_CLEARANCE_SECONDS));

/** The intro card's opacity at `frame`: 1, then a linear fade over the last `INTRO_FADE_SECONDS` before `endSeconds`, then 0. */
export const introOpacity = (frame: number, fps: number, endSeconds: number): number => {
  const end = endSeconds * fps;
  if (frame >= end) return 0;
  const fade = Math.min(INTRO_FADE_SECONDS * fps, end);
  return frame <= end - fade ? 1 : (end - frame) / fade;
};

/** Whether a `title` setting shows the intro card. */
export const showsIntro = (title: Overlay['title']): boolean => title === 'intro' || title === 'both';
/** Whether a `title` setting shows the corner label. */
export const showsCorner = (title: Overlay['title']): boolean => title === 'corner' || title === 'both';

export type MushafTitleCardProps = {
  /** The passage: its first surah and ayah, and its last ayah, of `toSurah` when it crosses surahs. */
  readonly surah: number;
  readonly fromAyah: number;
  readonly toAyah: number;
  /** The last ayah's surah, for a passage across surahs (version 2 timings); `surah` when left out. */
  readonly toSurah?: number | undefined;
  /** Shown under the range when not empty. */
  readonly reciter: string;
  readonly color: string;
  /** CSS font family of the texts; the surah name is set in QUL's surah-name font. */
  readonly font: string;
  /** The card covers the frame in this colour: the page's, so the lines come in from under it. */
  readonly background: string;
  /** Seconds at which the card is gone (`introEndSeconds()`). */
  readonly endSeconds: number;
  /** The surah name's type size and line box, and the measure its frame spans. */
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly width: number;
  /** The composition's `fontSrc` / `fontFallback` (`fontPropsFrom()`), for the surah-name font. */
  readonly fontProps?: FontProps | undefined;
};

/**
 * The intro card: the surah name in its printed frame (`<MushafSurahName framed>`), the range in
 * Latin and Arabic-Indic digits ("Al-Fatihah · 1:2–7 · ١:٢–٧"), and the reciter, centred on the
 * page colour over the whole frame, fading out to `endSeconds`. Nothing after that. A passage
 * across surahs is framed under its first surah's name and names both ends
 * ("Al-Falaq – An-Nas · 113:4–114:2 · ١١٣:٤–١١٤:٢"). Pure in its props and the frame.
 */
export const MushafTitleCard: React.FC<MushafTitleCardProps> = (props) => {
  const {surah, fromAyah, toAyah, reciter, color, font, background, endSeconds, fontSize, lineHeight, width} = props;
  const toSurah = props.toSurah ?? surah;
  const from = {surah, ayah: fromAyah};
  const to = {surah: toSurah, ayah: toAyah};
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const opacity = introOpacity(frame, fps, endSeconds);
  if (opacity <= 0) return null;
  const textSize = Math.round(fontSize * 0.55);
  return (
    <div
      data-mushaf-overlay="intro"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Math.round(textSize * 0.5),
        backgroundColor: background,
        color,
        fontFamily: font,
        opacity,
      }}
    >
      <div style={{width, height: lineHeight}}>
        <MushafSurahName surah={surah} framed fontSize={fontSize} lineHeight={lineHeight} {...props.fontProps} />
      </div>
      <div data-mushaf-overlay-part="range" style={{fontSize: textSize, lineHeight: 1.3}}>
        {surahSpanName(surah, toSurah)} · {ayahSpanText(from, to)} ·{' '}
        <span dir="rtl" style={{unicodeBidi: 'isolate'}}>
          {ayahSpanText(from, to, 'arabic')}
        </span>
      </div>
      {reciter !== '' && (
        <div data-mushaf-overlay-part="reciter" style={{fontSize: Math.round(textSize * 0.8), lineHeight: 1.3}}>
          {reciter}
        </div>
      )}
    </div>
  );
};

export type MushafCornerLabelProps = {
  /** The surah named when `ayahKey` is `null`; with neither, the label names no surah. */
  readonly surah: number | undefined;
  /** "surah:ayah" of the ayah being heard (or shown), `null` for none yet. */
  readonly ayahKey: string | null;
  readonly reciter: string;
  readonly color: string;
  readonly font: string;
  readonly corner: Overlay['corner'];
  /** px; also the label's distance from the edges. */
  readonly size: number;
  readonly opacity?: number | undefined;
};

const cornerStyle = (corner: Overlay['corner'], size: number): React.CSSProperties => {
  const top = corner === 'top-left' || corner === 'top-right';
  const left = corner === 'top-left' || corner === 'bottom-left';
  return {
    position: 'absolute',
    ...(top ? {top: size} : {bottom: size}),
    ...(left ? {left: size, textAlign: 'left'} : {right: size, textAlign: 'right'}),
  };
};

/**
 * The corner label: "Al-Fatihah · 1:3 · Reciter", the surah of the ayah being heard and that ayah's
 * key, the reciter when set, small in a corner of the frame. Pure in its props.
 */
export const MushafCornerLabel: React.FC<MushafCornerLabelProps> = ({
  surah,
  ayahKey,
  reciter,
  color,
  font,
  corner,
  size,
  opacity = 1,
}) => {
  if (opacity <= 0) return null;
  const keySurah = ayahKey === null ? Number.NaN : Number(ayahKey.split(':')[0]);
  const named = Number.isInteger(keySurah) ? keySurah : surah;
  const parts = named === undefined ? [] : [surahEnglishName(named)];
  if (ayahKey !== null) parts.push(ayahKey);
  if (parts.length === 0 && reciter === '') return null;
  if (reciter !== '') parts.push(reciter);
  return (
    <div
      data-mushaf-overlay="corner"
      style={{
        ...cornerStyle(corner, size),
        color,
        fontFamily: font,
        fontSize: size,
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
        direction: 'ltr',
        ...(opacity < 1 ? {opacity} : {}),
      }}
    >
      {parts.join(' · ')}
    </div>
  );
};

export type MushafTitleOverlayProps = {
  readonly overlay: Overlay;
  /**
   * The passage, for the card: its first surah and ayah, and its last ayah, of `toSurah` when it
   * crosses surahs (`passageSpan()` of the timings gives both ends). `undefined` (the `surah` of
   * timings across surahs, which have none): the card names no surah and no range, and the corner
   * label names the surah of `ayahKey` alone.
   */
  readonly surah: number | undefined;
  readonly fromAyah: number;
  readonly toAyah: number;
  /** The last ayah's surah, for a passage across surahs (version 2 timings); `surah` when left out. */
  readonly toSurah?: number | undefined;
  /** For the corner label: the ayah being heard, as the translation block names it. */
  readonly ayahKey: string | null;
  /** Seconds at which the first word is heard, or `null` without audio (see `introEndSeconds()`). */
  readonly firstWordSeconds: number | null;
  readonly background: string;
  readonly fontSize: number;
  readonly lineHeight: number;
  /** The measure the surah name's frame spans. */
  readonly width: number;
  readonly fontProps?: FontProps | undefined;
};

/**
 * The `overlay` group of a composition's props on the canvas: the intro card (`intro`, `both`) and
 * the corner label (`corner`, `both`), which, under `both`, comes in as the card goes. Nothing for
 * `title: 'none'`. Pure in its props and the frame.
 */
export const MushafTitleOverlay: React.FC<MushafTitleOverlayProps> = (props) => {
  const {overlay} = props;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  // A card names its passage: without a surah to name, there is none (and the corner label shows at once).
  const intro = showsIntro(overlay.title) && props.surah !== undefined;
  const endSeconds = introEndSeconds(overlay.introSeconds, props.firstWordSeconds);
  const cardOpacity = intro ? introOpacity(frame, fps, endSeconds) : 0;
  return (
    <>
      {intro && props.surah !== undefined && (
        <MushafTitleCard
          surah={props.surah}
          fromAyah={props.fromAyah}
          toAyah={props.toAyah}
          toSurah={props.toSurah}
          reciter={overlay.reciter}
          color={overlay.color}
          font={overlay.font}
          background={props.background}
          endSeconds={endSeconds}
          fontSize={props.fontSize}
          lineHeight={props.lineHeight}
          width={props.width}
          fontProps={props.fontProps}
        />
      )}
      {showsCorner(overlay.title) && (
        <MushafCornerLabel
          surah={props.surah}
          ayahKey={props.ayahKey}
          reciter={overlay.reciter}
          color={overlay.color}
          font={overlay.font}
          corner={overlay.corner}
          size={overlay.cornerSize}
          opacity={1 - cardOpacity}
        />
      )}
    </>
  );
};
