import {
  loadPageFont,
  MushafLine,
  type MushafLineData,
  type MushafWord,
  type RecitedRange,
  type WordContext,
  wordAt,
} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {useEffect} from 'react';
import {AbsoluteFill, Easing, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {volumeAt} from '../audio/volume';
import {backgroundFor} from '../background/compat';
import {MushafBackground} from '../background/MushafBackground';
import {endCardFrames} from '../compositions/extras';
import {
  CompositionAudio,
  CompositionEndCard,
  CornerLegend,
  glowLevelAt,
  StudioWarnings,
  translationsOf,
  useTranslationLayers,
  volumeCurveFor,
} from '../compositions/parts';
import {ayahAt, fileUrl} from '../compositions/shared';
import {MushafStudioError} from '../errors';
import {wordStarts} from '../lines';
import {arabicIndicDigits} from '../overlay';
import {
  activeWordStyleFrom,
  defaultOverlay,
  type FontProps,
  fontPropsFrom,
  themeSelectionFrom,
  wordStyleFrom,
} from '../schema';
import {MushafStudioPanel} from '../studio';
import {useInStudio} from '../studio/environment';
import {ayahKeyOf, TranslationStack} from '../translations';
import {LINES_PER_PAGE, type PageGeometry, pageGeometry, rowOf} from './geometry';
import {PageFrame} from './PageFrame';
import {inRange, type PageLineSlot, type PageSlot, pageLineAt, type ResolvedPage} from './resolve';
import type {MushafPageProps, PageText, PageView} from './schema';

/** Opacity of the words of the page outside the ayahs followed, and of another surah's header. */
export const OUTSIDE_OPACITY = 0.35;

type WordStyle = (word: MushafWord, context: WordContext) => React.CSSProperties | undefined;

/** `style` with the words outside the range dimmed to `OUTSIDE_OPACITY`: still there to read, not followed. */
const dimmingOutside =
  (style: WordStyle, range: RecitedRange): WordStyle =>
  (word, context) =>
    inRange(word, range) ? style(word, context) : {...style(word, context), opacity: OUTSIDE_OPACITY};

/** A header line belongs to the passage when it heads the surah recited; another surah's is dimmed with its words. */
const headerOutside = (line: MushafLineData, range: RecitedRange): boolean =>
  line.type !== 'ayah' && line.surahNumber !== undefined && line.surahNumber !== range.surah;

/** 0 → 1 over `frames` from `at`, eased in and out; 1 at once for no frames. */
const progress = (frame: number, at: number, frames: number): number =>
  frames <= 0
    ? Number(frame >= at)
    : interpolate(frame, [at, at + frames], [0, 1], {
        easing: Easing.inOut(Easing.cubic),
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });

/**
 * A page's style while it turns in (`incoming`, 0 → 1) and out (`outgoing`, 0 → 1). `slide` moves
 * the leaf the way a right-to-left book turns: the next page comes in from the left while the one
 * read goes out to the right. `cut` turns nothing (its pages never overlap).
 */
export const turnStyle = (
  turn: PageView['turn'],
  incoming: number,
  outgoing: number,
  width: number,
): React.CSSProperties => {
  if (turn === 'fade') return {opacity: incoming * (1 - outgoing)};
  if (turn === 'slide') {
    const x = Math.round((incoming - 1 + outgoing) * width);
    return x === 0 ? {} : {transform: `translateX(${x}px)`};
  }
  return {};
};

/** Starts loading a page's font from the same sources its lines will use, so the turn to it never waits. */
const PreloadPageFont: React.FC<{readonly line: MushafLineData; readonly fontProps: FontProps}> = ({
  line,
  fontProps,
}) => {
  const {mushaf, theme, page} = line;
  const {fontSrc, fontFallback} = fontProps;
  useEffect(() => {
    try {
      loadPageFont({mushaf, theme, page, fontSrc, fallback: fontFallback});
    } catch {
      // A bad source is reported by the page's own lines when they render.
    }
  }, [mushaf, theme, page, fontSrc, fontFallback]);
  return null;
};

type PageLeafProps = {
  readonly slot: PageSlot;
  readonly geometry: PageGeometry;
  readonly pageView: PageView;
  readonly background: string;
  readonly current: PageLineSlot | null;
  readonly range: RecitedRange;
  readonly wordStyle: WordStyle;
  readonly activeProps: {readonly activeWordId: string | null; readonly activeWordStyle?: React.CSSProperties};
  readonly fontProps: FontProps;
};

/** The current line's mark, in its slot behind the line: a band a little wider than the measure, or a rule under it. */
const LineMark: React.FC<{readonly pageView: PageView; readonly geometry: PageGeometry}> = ({pageView, geometry}) => {
  const {fontSize, lineHeight, padX} = geometry;
  const color = pageView.lineHighlightColor;
  if (pageView.lineHighlight === 'band') {
    const inset = Math.round(padX / 2);
    return (
      <div
        data-line-highlight="band"
        style={{
          position: 'absolute',
          left: -inset,
          right: -inset,
          top: 0,
          bottom: 0,
          background: color,
          borderRadius: Math.round(0.3 * fontSize),
        }}
      />
    );
  }
  return (
    <div
      data-line-highlight="underline"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: Math.round(0.12 * lineHeight),
        height: Math.max(2, Math.round(0.08 * fontSize)),
        background: color,
      }}
    />
  );
};

/** One printed page: its border, every line in its row of the grid, the current one marked, the page number. */
const PageLeaf: React.FC<PageLeafProps> = ({
  slot,
  geometry,
  pageView,
  background,
  current,
  range,
  wordStyle,
  activeProps,
  fontProps,
}) => {
  const {fontSize, lineHeight, measure} = geometry;
  const currentHere = current?.page === slot.page ? current : null;
  return (
    <div
      data-mushaf-page={slot.page}
      style={{
        position: 'absolute',
        left: geometry.left,
        top: geometry.top,
        width: geometry.width,
        height: geometry.height,
      }}
    >
      {pageView.frame !== 'none' && <PageFrame frame={pageView.frame} geometry={geometry} background={background} />}
      <div
        style={{
          position: 'absolute',
          left: geometry.textLeft,
          top: geometry.textTop,
          width: measure,
          height: LINES_PER_PAGE * lineHeight,
        }}
      >
        {slot.lines.map((line) => {
          const isCurrent = currentHere?.line === line.line;
          const dimOther = current !== null && !isCurrent ? pageView.dimOtherLines : 1;
          const opacity = dimOther * (headerOutside(line, range) ? OUTSIDE_OPACITY : 1);
          return (
            <div
              key={line.line}
              data-page-line={line.line}
              data-current={isCurrent ? 'true' : undefined}
              style={{
                position: 'absolute',
                left: 0,
                top: Math.round(rowOf(line.line, slot.lines.length) * lineHeight),
                width: measure,
                height: lineHeight,
                ...(opacity === 1 ? {} : {opacity}),
              }}
            >
              {isCurrent && pageView.lineHighlight !== 'none' && <LineMark pageView={pageView} geometry={geometry} />}
              {/* Positioned after the mark, so the line paints over it. */}
              <div style={{position: 'relative'}}>
                <MushafLine
                  line={line}
                  fit="line"
                  fontSize={fontSize}
                  lineHeight={lineHeight}
                  wordStyle={wordStyle}
                  {...activeProps}
                  {...fontProps}
                />
              </div>
            </div>
          );
        })}
      </div>
      {pageView.pageNumber && (
        <div
          data-page-number={slot.page}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: geometry.footer,
            lineHeight: `${geometry.footer}px`,
            textAlign: 'center',
            fontFamily: '"Amiri", "Noto Naskh Arabic", "Scheherazade New", serif',
            fontSize: Math.round(0.6 * fontSize),
            direction: 'rtl',
          }}
        >
          {arabicIndicDigits(String(slot.page))}
        </div>
      )}
    </div>
  );
};

/** Where the translations go: `auto` picks the room under the page when it holds three lines of them, else beside it. */
export const pageTranslationPlace = (
  position: PageText['translationPosition'],
  geometry: Pick<PageGeometry, 'top' | 'height'>,
  frameHeight: number,
  fontSize: number,
): 'beside' | 'below' | 'none' => {
  if (position !== 'auto') return position;
  const gap = Math.round(fontSize * 0.6);
  const room = frameHeight - (geometry.top + geometry.height) - 2 * gap;
  return room >= 3 * fontSize * 1.35 ? 'below' : 'beside';
};

/**
 * The translations' block: under the page, as wide as it (`below`), or in the gutter left of it
 * between the side margin and the page, centred top to bottom (`beside`); `translationOffsetY` down.
 */
export const pageTranslationStyle = (
  place: 'beside' | 'below',
  geometry: Pick<PageGeometry, 'top' | 'left' | 'width' | 'height'>,
  marginX: number,
  fontSize: number,
  offsetY: number,
): React.CSSProperties => {
  const gap = Math.round(fontSize * 0.6);
  const nudge = offsetY === 0 ? '' : ` translateY(${offsetY}px)`;
  return place === 'below'
    ? {
        position: 'absolute',
        left: geometry.left,
        width: geometry.width,
        top: geometry.top + geometry.height + gap,
        ...(nudge ? {transform: nudge.trim()} : {}),
      }
    : {
        position: 'absolute',
        left: marginX,
        width: Math.max(1, geometry.left - marginX - gap),
        top: '50%',
        transform: `translateY(-50%)${nudge}`,
      };
};

/**
 * The whole printed page of the KFGQPC V4 mushaf while a recitation plays, as a reader follows it
 * in print: every line of the page in its place (the surah headers and basmalah lines included),
 * the line being recited marked with a band or a rule, the word being heard highlighted, the words
 * outside the ayahs followed dimmed, and the page turning to the next one just before its first
 * word. Around it its `background` (the glow following the recitation), the translations beside or
 * under the page (`text`, up to three stacked), the tajweed legend in a corner and an end card
 * after the last ayah when asked; the audio normalised and faded as `audio` says. In the Studio, the
 * doubtful words are marked, the fonts and audio warnings shown, and the Mushaf panel docked.
 */
export const MushafPage: React.FC<MushafPageProps> = (props) => {
  const {audioFile, fonts, layout, highlight, review, pageView, text, legend, endCard, audio} = props;
  const {width, height, fps, durationInFrames, id} = useVideoConfig();
  const frame = useCurrentFrame();
  const isStudio = useInStudio();
  const resolved = props.resolved as ResolvedPage | null;
  if (!resolved) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      'MushafPage: `resolved` is null. calculateMetadata fills it in: pass calculateMushafPageMetadata to <Composition calculateMetadata>, or resolve the props with resolvePage() for a <Player>.',
      {prop: 'resolved'},
    );
  }
  const {timings, pages, range} = resolved;
  const translationLayers = useTranslationLayers(text, translationsOf(resolved));
  // The frames before the end card: the audio fades out by their end, the last page stays to it.
  const cardFrames = endCardFrames(endCard, fps);
  const contentFrames = Math.max(1, durationInFrames - cardFrames);
  const curve = volumeCurveFor(audio, resolved.audio, contentFrames, fps);
  const now = frame / fps;
  const heard = wordAt(timings, now);
  const activeWordId = highlight.mode === 'none' ? null : heard;
  const activeWordStyle = highlight.mode === 'word' ? activeWordStyleFrom(highlight) : undefined;
  const activeProps = activeWordStyle ? {activeWordId, activeWordStyle} : {activeWordId};
  const current = pageLineAt(resolved.lines, now);
  const geometry = pageGeometry(layout, {width, height});
  const firstLine = pages[0]?.lines[0];
  const fontSetup = fontPropsFrom(fonts, firstLine?.fontSet ?? 'qpc-v4', staticFile);
  const starts = wordStarts(timings);
  const turnFrames = pageView.turn === 'cut' ? 0 : Math.max(1, Math.round(pageView.turnSeconds * fps));

  const leaves = pages.map((slot, i) => {
    const from = Math.round(slot.start * fps);
    const next = pages[i + 1];
    const nextFrom = next ? Math.round(next.start * fps) : null;
    // The page stays under the next one while it turns in; the last one to the end.
    const to = nextFrom === null ? contentFrames : nextFrom + turnFrames;
    const incoming = i === 0 ? 1 : progress(frame, from, turnFrames);
    const outgoing = nextFrom === null ? 0 : progress(frame, nextFrom, turnFrames);
    const wordStyle = dimmingOutside(
      wordStyleFrom({
        highlight,
        review,
        doubtful: resolved.doubtful,
        timingsIndex: starts,
        timings,
        activeWordId,
        isStudio,
        sequenceFrom: from,
      }),
      range,
    );
    const nextLine = next?.lines[0];
    return (
      <Sequence
        key={slot.page}
        from={from}
        durationInFrames={Math.max(1, to - from)}
        premountFor={turnFrames + fps}
        name={`Page ${slot.page}`}
      >
        <AbsoluteFill style={turnStyle(pageView.turn, incoming, outgoing, width)}>
          <PageLeaf
            slot={slot}
            geometry={geometry}
            pageView={pageView}
            background={layout.background}
            current={current}
            range={range}
            wordStyle={wordStyle}
            activeProps={activeProps}
            fontProps={fontSetup.props}
          />
        </AbsoluteFill>
        {nextLine && <PreloadPageFont line={nextLine} fontProps={fontSetup.props} />}
      </Sequence>
    );
  });

  const translationSize = translationLayers[0]?.fontSize ?? text.translationSize;
  const place =
    translationLayers.length === 0
      ? 'none'
      : pageTranslationPlace(text.translationPosition, geometry, height, translationSize);
  const ayahKey = ayahKeyOf(heard) ?? ayahAt(timings, now) ?? `${timings.surah}:${timings.ayat[0]!.ayah}`;
  // The page has no title overlay: its cards take the overlay's default serif.
  const overlayFont = defaultOverlay.font;
  return (
    <AbsoluteFill style={{backgroundColor: layout.background, color: layout.color, overflow: 'hidden'}}>
      <MushafBackground
        background={{
          ...backgroundFor(props.background, layout),
          ...(resolved.backgroundVideoSeconds ? {videoSeconds: resolved.backgroundVideoSeconds} : {}),
        }}
        audioLevel={glowLevelAt(resolved.audio, now, fps)}
      />
      {audioFile !== '' && (
        <CompositionAudio
          src={fileUrl(audioFile, staticFile)}
          trimBefore={Math.round(resolved.audioOffsetSeconds * fps)}
          volume={(f) => volumeAt(f, curve)}
        />
      )}
      {leaves}
      {place !== 'none' && (
        <div
          data-mushaf-block="Translation"
          data-place={place}
          style={pageTranslationStyle(place, geometry, layout.marginX, translationSize, text.translationOffsetY)}
        >
          <TranslationStack layers={translationLayers} ayahKey={ayahKey} />
        </div>
      )}
      <CornerLegend
        legend={legend}
        theme={themeSelectionFrom(props.theme, props.customTheme)}
        fontFamily={overlayFont}
        color={layout.color}
        background={layout.background}
        width={width}
      />
      <CompositionEndCard
        endCard={endCard}
        content={resolved.endCard}
        timings={timings}
        translations={translationLayers.map((layer) => layer.translation)}
        reciter=""
        from={contentFrames}
        durationInFrames={cardFrames}
        fontFamily={overlayFont}
        color={layout.color}
        background={layout.background}
        width={width}
        height={height}
      />
      {isStudio && <StudioWarnings warnings={[fontSetup.warning, resolved.audioWarning]} />}
      {isStudio && <MushafStudioPanel compositionId={id} props={props} />}
    </AbsoluteFill>
  );
};
