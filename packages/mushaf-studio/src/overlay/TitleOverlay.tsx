import {MushafSurahName} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {FontProps, Overlay} from '../schema';
import {ARABIC_LABEL_FAMILY, studioFontStyle} from '../schema/fonts';
import {withAlpha} from '../schema/highlight';
import {frameColorOf, frameGeometry, SINE, type Tempo, tempoFrames, tempoSeconds} from '../schema/tokens';
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

/** Seconds into the video the intro card's content starts to come in: frame 0 is the bare ground. */
export const CARD_IN_FROM_SECONDS = 0.2;

/**
 * The intro card's content opacity at `seconds`: in over `cardIn` on `SINE` from 0.2 s, held, out
 * over `cardOut` on `SINE` ending at `endSeconds` (`introSeconds` when the card adds its time).
 * 0 at frame 0 and from `endSeconds` on.
 */
export const introCardOpacity = (seconds: number, endSeconds: number, tempo: Tempo = 'calm'): number => {
  if (seconds >= endSeconds) return 0;
  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
  const cardIn = tempoSeconds('cardIn', tempo);
  const cardOut = Math.min(tempoSeconds('cardOut', tempo), endSeconds);
  const rise = SINE(clamp01((seconds - CARD_IN_FROM_SECONDS) / cardIn));
  const fall = cardOut <= 0 ? 0 : SINE(clamp01((seconds - (endSeconds - cardOut)) / cardOut));
  return Math.round(rise * (1 - fall) * 10_000) / 10_000;
};

/**
 * How many frames before the card's end the lines may start to come in: from the first frame its
 * content is under 0.25 on its way out (`cardOut` on `SINE`), so the hand-off is sequential (the
 * card under 0.25 before the lines start) and the frame never dips to bare paper between them.
 * 7 at the calm tempo (21 frames out), 10 at the slow one (30); 0 for a card too short to fade.
 */
export const introHandoffFrames = (tempo: Tempo, fps: number, introSeconds = Number.POSITIVE_INFINITY): number => {
  const out = Math.round(Math.min(tempoSeconds('cardOut', tempo), introSeconds) * fps);
  for (let f = 0; f <= out; f++) if (1 - SINE(f / Math.max(1, out)) < 0.25) return out - f;
  return 0;
};

/**
 * The opacity of a card's ground over the lines (a composition whose lines start under it): 1 from
 * frame 0, out with the content over `cardOut` ending at `endSeconds`.
 */
export const introCoverOpacity = (seconds: number, endSeconds: number, tempo: Tempo = 'calm'): number => {
  if (seconds >= endSeconds) return 0;
  const cardOut = Math.min(tempoSeconds('cardOut', tempo), endSeconds);
  if (cardOut <= 0) return 1;
  const t = Math.min(1, Math.max(0, (seconds - (endSeconds - cardOut)) / cardOut));
  return Math.round((1 - SINE(t)) * 10_000) / 10_000;
};

/**
 * The card's Arabic range, in Arabic-Indic digits inside a right-to-left isolate (U+2067 … U+2069),
 * so the first ayah is the rightmost numeral: «الآيات ٢–٧», «الآية ٥» for one ayah, «الآيات ١١٣:٤–١١٤:٢» across surahs.
 */
export const arabicRangeText = (
  from: {readonly surah: number; readonly ayah: number},
  to: {readonly surah: number; readonly ayah: number},
): string => {
  const one = from.surah === to.surah && from.ayah === to.ayah;
  const numbers =
    from.surah === to.surah
      ? arabicIndicDigits(one ? `${from.ayah}` : `${from.ayah}–${to.ayah}`)
      : ayahSpanText(from, to, 'arabic');
  return `⁧${one ? 'الآية' : 'الآيات'} ${numbers}⁩`;
};

/** The card's Latin range, set in small caps: "Āyāt 2–7", "Āyah 5", "Āyāt 113:4–114:2" across surahs. */
export const latinRangeText = (
  from: {readonly surah: number; readonly ayah: number},
  to: {readonly surah: number; readonly ayah: number},
): string => {
  if (from.surah !== to.surah) return `Āyāt ${ayahSpanText(from, to)}`;
  return from.ayah === to.ayah ? `Āyah ${from.ayah}` : `Āyāt ${from.ayah}–${to.ayah}`;
};

/**
 * A Latin label as the small caps draw it: without the marks on its letters, `smallCapsLabel('Āyāt
 * 2–7')` is "Ayat 2–7". Small caps set every letter as a capital, and EB Garamond (as Google Fonts
 * serves it, at every weight) draws the macron of a capital Ā beside the letter rather than over
 * it; the corner label's surah names carry no marks either.
 */
export const smallCapsLabel = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');

/** The translation's credit on the intro card (or, without one, in the end card's credits). */
export const translationCredit = (name: string): string => `Translation of the meanings · ${name}`;

/** The label face of the render design: small caps, a little letter-spaced, tabular figures. */
export const SMALL_CAPS: React.CSSProperties = {
  fontVariantCaps: 'all-small-caps',
  letterSpacing: '0.08em',
  fontVariantNumeric: 'tabular-nums',
};

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
  /** `overlay.font`: `'auto'` (EB Garamond, Amiri for Arabic) or a CSS font family of the Latin texts. */
  readonly font: string;
  /**
   * The ground. With `backdrop`, the card covers the frame in it (a composition whose lines start
   * under the card); without, the card is drawn on whatever the background paints.
   */
  readonly background: string;
  /** Cover the frame in `background`, fading with the card. Default `false`. */
  readonly backdrop?: boolean | undefined;
  /** Seconds at which the card is gone: `introSeconds`, or `introEndSeconds()` for a card over the lines. */
  readonly endSeconds: number;
  /** `animation.tempo`: the lengths of the card's fades. Default `'calm'`. */
  readonly tempo?: Tempo | undefined;
  /** The lines' type size and line box, and their measure: the framed name and the hairline are sized on them. */
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly width: number;
  /** The metal of the hairline, its lozenge and the name's frame (`metalOf()`). Default the light ground's gold. */
  readonly metal?: string | undefined;
  /** The translation shown, credited on the card ("Translation of the meanings · …"); `null` for none. */
  readonly translationName?: string | null | undefined;
  /** The composition's `fontSrc` / `fontFallback` (`fontPropsFrom()`), for the surah-name font. */
  readonly fontProps?: FontProps | undefined;
};

/**
 * The intro card (render-design.md 5.6), centred on the ground: the framed surah name
 * (`<MushafSurahName framed>`, 46 % of the measure at 16:9, 72 % at the other formats, centred at
 * 44 % of the height), a gold hairline with a lozenge `0.9 × lineBox` under it, the range in Amiri
 * («الآيات ٢–٧», the first ayah rightmost), the range again in small caps ("Ayat 2–7", `smallCapsLabel()`), the
 * reciter in italic and the translation's credit. Its content comes in from 0.2 s over `cardIn`
 * and is gone at `endSeconds`. A passage across surahs is framed under its first surah's name and
 * names both ends. Pure in its props and the frame.
 */
export const MushafTitleCard: React.FC<MushafTitleCardProps> = (props) => {
  const {surah, fromAyah, toAyah, reciter, color, background, endSeconds, fontSize, lineHeight, width} = props;
  const toSurah = props.toSurah ?? surah;
  const from = {surah, ayah: fromAyah};
  const to = {surah: toSurah, ayah: toAyah};
  const frame = useCurrentFrame();
  const {fps, width: frameWidth, height} = useVideoConfig();
  const seconds = frame / fps;
  const content = introCardOpacity(seconds, endSeconds, props.tempo);
  // A card over the lines covers them in the ground until it goes, fading out with its content.
  const cover = props.backdrop === true ? introCoverOpacity(seconds, endSeconds, props.tempo) : 0;
  if (content <= 0 && cover <= 0) return null;
  const {label: L, unit: u} = frameGeometry(frameWidth, height);
  const share = frameWidth > height ? 0.46 : 0.72;
  const nameWidth = Math.round(width * share);
  const nameSize = Math.round(fontSize * share);
  const nameBox = Math.round(lineHeight * share);
  const metal = props.metal ?? '#b8913a';
  const lozenge = Math.round(7 * u);
  return (
    <div
      data-mushaf-overlay="intro"
      style={{position: 'absolute', inset: 0, color, ...studioFontStyle(props.font, 'label')}}
    >
      {props.backdrop === true ? (
        <div
          data-mushaf-overlay-part="backdrop"
          style={{position: 'absolute', inset: 0, backgroundColor: background, opacity: cover}}
        />
      ) : null}
      <div
        data-mushaf-overlay-part="content"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: Math.round(height * 0.44 - nameBox / 2),
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          opacity: content,
        }}
      >
        <div style={{width: nameWidth, height: nameBox}}>
          <MushafSurahName
            surah={surah}
            framed
            frameColor={frameColorOf(metal, background)}
            fontSize={nameSize}
            lineHeight={nameBox}
            {...props.fontProps}
          />
        </div>
        <div
          data-mushaf-overlay-part="rule"
          style={{
            position: 'relative',
            width: Math.round(width * 0.18),
            height: Math.max(1, 1.5 * u),
            marginTop: Math.round(0.9 * lineHeight - nameBox / 2),
            background: withAlpha(metal, 0.7),
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: lozenge,
              height: lozenge,
              background: withAlpha(metal, 0.7),
              transform: 'translate(-50%, -50%) rotate(45deg)',
            }}
          />
        </div>
        <div
          data-mushaf-overlay-part="arabic-range"
          dir="rtl"
          lang="ar"
          style={{
            fontFamily: ARABIC_LABEL_FAMILY,
            fontWeight: 400,
            fontSize: Math.round(1.1 * L),
            lineHeight: 1.5,
            marginTop: Math.round(0.6 * L),
            opacity: 0.75,
          }}
        >
          {arabicRangeText(from, to)}
        </div>
        <div data-mushaf-overlay-part="range" style={{...SMALL_CAPS, fontSize: L, lineHeight: 1.4, opacity: 0.6}}>
          {smallCapsLabel(latinRangeText(from, to))}
        </div>
        {reciter !== '' && (
          <div
            data-mushaf-overlay-part="reciter"
            style={{
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: Math.round(0.95 * L),
              lineHeight: 1.4,
              opacity: 0.55,
              marginTop: Math.round(0.3 * L),
            }}
          >
            {reciter}
          </div>
        )}
        {props.translationName ? (
          <div
            data-mushaf-overlay-part="translation"
            style={{
              fontWeight: 400,
              fontSize: Math.round(0.8 * L),
              lineHeight: 1.4,
              opacity: 0.6,
              marginTop: Math.round(0.4 * L),
            }}
          >
            {translationCredit(props.translationName)}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export type MushafCornerLabelProps = {
  /** The surah named when `ayahKey` is `null`; with neither, the label names no surah. */
  readonly surah: number | undefined;
  /** "surah:ayah" of the ayah being heard (or shown), `null` for none yet. */
  readonly ayahKey: string | null;
  /** The ayah leaving while the number changes (`shownAyahAt()` over `labelChange`), at its opacity. */
  readonly outgoing?: {readonly ayahKey: string; readonly opacity: number} | null | undefined;
  /** 0-1: the incoming number's opacity while it changes (default 1). */
  readonly textOpacity?: number | undefined;
  /** No longer joined into the label (kept for callers written before the render design). */
  readonly reciter?: string | undefined;
  /** The label's ink: drawn at 60 %. */
  readonly color: string;
  /** `overlay.font`: `'auto'` for EB Garamond 500 small caps, or a CSS font family. */
  readonly font: string;
  readonly corner: Overlay['corner'];
  /** px. */
  readonly size: number;
  /** px from the top and bottom edges, and from the sides (the safe area; at 9:16 the platform bands). */
  readonly inset?: {readonly top: number; readonly bottom: number; readonly side: number} | undefined;
  /** Over an image or video: a soft halo of the ground behind the letters. Unset on a flat ground. */
  readonly halo?: string | undefined;
  readonly opacity?: number | undefined;
};

const cornerStyle = (
  corner: Overlay['corner'],
  inset: {readonly top: number; readonly bottom: number; readonly side: number},
): React.CSSProperties => {
  const top = corner === 'top-left' || corner === 'top-right';
  const left = corner === 'top-left' || corner === 'bottom-left';
  return {
    position: 'absolute',
    ...(top ? {top: inset.top} : {bottom: inset.bottom}),
    ...(left ? {left: inset.side, textAlign: 'left'} : {right: inset.side, textAlign: 'right'}),
  };
};

/** The surah and ayah of a key: `"1:3"` → `{surah: 1, ayah: '3'}`; `null` for none. */
const keyParts = (key: string | null): {readonly surah: number; readonly ayah: string} | null => {
  if (key === null) return null;
  const [surah, ayah] = key.split(':');
  const number = Number(surah);
  return Number.isInteger(number) && ayah !== undefined ? {surah: number, ayah} : null;
};

/**
 * The corner label: "AL-FATIHAH · 3" in small caps, the surah of the ayah being heard and that
 * ayah's number, in a corner inside the safe area, at 60 % of its ink. Only the number changes
 * (`outgoing` dissolving into `ayahKey`); the whole label when the surah changes too. Pure in its props.
 */
export const MushafCornerLabel: React.FC<MushafCornerLabelProps> = ({
  surah,
  ayahKey,
  outgoing,
  textOpacity,
  color,
  font,
  corner,
  size,
  inset,
  halo,
  opacity = 1,
}) => {
  if (opacity <= 0) return null;
  const current = keyParts(ayahKey);
  const leaving = keyParts(outgoing?.ayahKey ?? null);
  const named = current?.surah ?? surah;
  if (named === undefined) return null;
  const name = surahEnglishName(named);
  // The surah's name stays while only the number changes.
  const sameSurah = leaving === null || leaving.surah === named;
  const prefix = current === null ? name : `${name} · `;
  const number = (key: {readonly surah: number; readonly ayah: string} | null): string =>
    key === null ? '' : sameSurah ? key.ayah : `${surahEnglishName(key.surah)} · ${key.ayah}`;
  return (
    <div
      data-mushaf-overlay="corner"
      style={{
        ...cornerStyle(corner, inset ?? {top: size, bottom: size, side: size}),
        color,
        ...studioFontStyle(font, 'label'),
        ...SMALL_CAPS,
        fontSize: size,
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
        direction: 'ltr',
        opacity: Math.round(0.6 * opacity * 10_000) / 10_000,
        ...(halo === undefined ? {} : {textShadow: `0 0 0.6em ${halo}`}),
      }}
    >
      {sameSurah ? prefix : null}
      {leaving !== null && outgoing ? (
        <span style={{display: 'inline-grid'}}>
          <span
            data-mushaf-overlay-part="outgoing"
            aria-hidden="true"
            style={{gridArea: '1 / 1', opacity: outgoing.opacity}}
          >
            {number(leaving)}
          </span>
          <span style={{gridArea: '1 / 1', opacity: textOpacity ?? 1}}>
            {sameSurah ? number(current) : `${prefix}${number(current)}`}
          </span>
        </span>
      ) : (
        number(current)
      )}
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
  /** For the corner label: the ayah on screen, as the translation shows it. */
  readonly ayahKey: string | null;
  /** The ayah leaving while the corner number changes, and the incoming one's opacity (`shownAyahAt()` over `labelChange`). */
  readonly ayahChange?:
    | {readonly outgoing: {readonly key: string; readonly opacity: number} | null; readonly opacity: number}
    | undefined;
  /**
   * Seconds at which the first word is heard, or `null` without audio. Used only by a card over the
   * lines (`addsTime` off): it goes 0.3 s before that word (`introEndSeconds()`).
   */
  readonly firstWordSeconds: number | null;
  /**
   * The composition put the card's time before the recording (`introDelaySeconds()`): the card has
   * its whole `introSeconds` on the bare ground. Off: the card covers the lines in `background` and
   * goes before the first word. Default `false`.
   */
  readonly addsTime?: boolean | undefined;
  /** The ground. */
  readonly background: string;
  /** Over an image or a video: the corner label gets a soft halo of the ground. */
  readonly overImage?: boolean | undefined;
  /**
   * The composition draws the jadwal (`layout.frame: 'hairline'`): the corner label goes inside its
   * inner rule (`frameGeometry(width, height, {jadwal: true})`), never across the gold. Default `false`.
   */
  readonly jadwal?: boolean | undefined;
  readonly tempo?: Tempo | undefined;
  readonly fontSize: number;
  readonly lineHeight: number;
  /** The measure the surah name's frame spans. */
  readonly width: number;
  /** The metal of the card's hairline (`metalOf()`). */
  readonly metal?: string | undefined;
  /** The translation shown, credited on the card; `null` for none. */
  readonly translationName?: string | null | undefined;
  readonly fontProps?: FontProps | undefined;
};

/** Seconds after the card the corner label starts to come in (0.5 s from the start without one). */
const CORNER_AFTER_CARD_SECONDS = 0.4;
const CORNER_ALONE_SECONDS = 0.5;

/**
 * The `overlay` group of a composition's props on the canvas: the intro card (`intro`, `both`) and
 * the corner label (`corner`, `both`), which fades in over 24 frames from 0.4 s after the card (0.5 s
 * into the video without one), inside the safe area (at 9:16 clear of the platform bands, and inside
 * the jadwal's inner rule when one is drawn). Nothing for `title: 'none'`. Pure in its props and the
 * frame.
 */
export const MushafTitleOverlay: React.FC<MushafTitleOverlayProps> = (props) => {
  const {overlay} = props;
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  // A card names its passage: without a surah to name, there is none (and the corner label shows at once).
  const intro = showsIntro(overlay.title) && props.surah !== undefined;
  const addsTime = props.addsTime === true;
  const endSeconds = addsTime ? overlay.introSeconds : introEndSeconds(overlay.introSeconds, props.firstWordSeconds);
  const geometry = frameGeometry(width, height, {jadwal: props.jadwal});
  const cornerFrom = intro
    ? (endSeconds + CORNER_AFTER_CARD_SECONDS) * fps
    : props.surah === undefined
      ? 0
      : CORNER_ALONE_SECONDS * fps;
  const cornerIn = tempoFrames('windowIn', 'calm', fps);
  const cornerOpacity = cornerFrom <= 0 ? 1 : SINE(Math.min(1, Math.max(0, (frame - cornerFrom) / cornerIn)));
  const change = props.ayahChange;
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
          backdrop={!addsTime}
          endSeconds={endSeconds}
          tempo={props.tempo}
          fontSize={props.fontSize}
          lineHeight={props.lineHeight}
          width={props.width}
          metal={props.metal}
          translationName={props.translationName}
          fontProps={props.fontProps}
        />
      )}
      {showsCorner(overlay.title) && (
        <MushafCornerLabel
          surah={props.surah}
          ayahKey={props.ayahKey}
          outgoing={change?.outgoing ? {ayahKey: change.outgoing.key, opacity: change.outgoing.opacity} : null}
          textOpacity={change?.opacity}
          color={overlay.color}
          font={overlay.font}
          corner={overlay.corner}
          size={overlay.cornerSize > 0 ? overlay.cornerSize : geometry.label}
          inset={{top: geometry.top, bottom: geometry.bottom, side: geometry.safe}}
          {...(props.overImage ? {halo: withAlpha(props.background, 0.5)} : {})}
          opacity={cornerOpacity}
        />
      )}
    </>
  );
};
