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
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {BACKGROUND_IMAGE_STYLE, fileUrl, WARNING_STYLE} from '../compositions/shared';
import {MushafStudioError} from '../errors';
import {wordStarts} from '../lines';
import {arabicIndicDigits} from '../overlay';
import {activeWordStyleFrom, type FontProps, fontPropsFrom, wordStyleFrom} from '../schema';
import {useInStudio} from '../studio/environment';
import {LINES_PER_PAGE, type PageGeometry, pageGeometry, rowOf} from './geometry';
import {PageFrame} from './PageFrame';
import {inRange, type PageLineSlot, type PageSlot, pageLineAt, type ResolvedPage} from './resolve';
import type {MushafPageProps, PageView} from './schema';

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

/**
 * The whole printed page of the KFGQPC V4 mushaf while a recitation plays, as a reader follows it
 * in print: every line of the page in its place (the surah headers and basmalah lines included),
 * the line being recited marked with a band or a rule, the word being heard highlighted, the words
 * outside the ayahs followed dimmed, and the page turning to the next one just before its first
 * word. In the Studio, the doubtful words are marked.
 */
export const MushafPage: React.FC<MushafPageProps> = (props) => {
  const {audioFile, fonts, layout, highlight, review, pageView} = props;
  const {width, height, fps, durationInFrames} = useVideoConfig();
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
  const now = frame / fps;
  const activeWordId = highlight.mode === 'none' ? null : wordAt(timings, now);
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
    const to = nextFrom === null ? durationInFrames : nextFrom + turnFrames;
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

  return (
    <AbsoluteFill style={{backgroundColor: layout.background, color: layout.color, overflow: 'hidden'}}>
      {layout.backgroundImage !== '' && (
        <Img src={fileUrl(layout.backgroundImage, staticFile)} style={BACKGROUND_IMAGE_STYLE} />
      )}
      {audioFile !== '' && (
        <Audio src={fileUrl(audioFile, staticFile)} trimBefore={Math.round(resolved.audioOffsetSeconds * fps)} />
      )}
      {leaves}
      {isStudio && fontSetup.warning !== null && <div style={WARNING_STYLE}>Mushaf Studio: {fontSetup.warning}</div>}
    </AbsoluteFill>
  );
};
