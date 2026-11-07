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
import {useEffect, useMemo} from 'react';
import {AbsoluteFill, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {followsHostAudio} from '../audio/host';
import {volumeAt} from '../audio/volume';
import {backgroundFor, groundFor} from '../background/compat';
import {Jadwal} from '../background/Jadwal';
import {MushafBackground} from '../background/MushafBackground';
import {endCardFrames} from '../compositions/extras';
import {useStudioFonts} from '../compositions/fonts';
import {
  CompositionAudio,
  CompositionEndCard,
  LegendBand,
  legendReserve,
  readableLayers,
  StudioWarnings,
  translationsOf,
  useTranslationLayers,
  volumeCurveFor,
  type WithPanelOption,
} from '../compositions/parts';
import {ayahAt, recordingUrl} from '../compositions/shared';
import {passageSpan} from '../compositions/timings';
import {MushafStudioError} from '../errors';
import {wordStarts} from '../lines';
import {arabicIndicDigits} from '../overlay';
import {
  defaultOverlay,
  type FontProps,
  fontPropsFrom,
  inkTintFor,
  markerIds,
  metalOf,
  studioFontFamily,
  themeSelectionFrom,
  washAlpha,
  washColor,
  wordStyleFrom,
} from '../schema';
import {dissolve, dissolveShares} from '../schema/tokens';
import {MushafStudioPanel} from '../studio';
import {useInStudio} from '../studio/environment';
import {ayahKeyOf, TranslationStack} from '../translations';
import {LINES_PER_PAGE, type PageGeometry, pageGeometry, rowOf} from './geometry';
import {PageFrame} from './PageFrame';
import {
  inRanges,
  PAGE_LEAD_IN_SECONDS,
  type PageLineSlot,
  type PageSlot,
  pageLineAt,
  type ResolvedPage,
  rangesOf,
} from './resolve';
import type {MushafPageProps, PageText, PageView} from './schema';
import {pageLineEmphasis, pageTurns} from './turns';

/** Opacity of the words of the page outside the ayahs followed, and of another surah's header: there to read, at rest. */
export const OUTSIDE_OPACITY = 0.5;

type WordStyle = (word: MushafWord, context: WordContext) => React.CSSProperties | undefined;

/** `style` with the words outside the ranges dimmed to `OUTSIDE_OPACITY`: still there to read, not followed. */
const dimmingOutside =
  (style: WordStyle, ranges: readonly RecitedRange[]): WordStyle =>
  (word, context) =>
    inRanges(word, ranges) ? style(word, context) : {...style(word, context), opacity: OUTSIDE_OPACITY};

/** A header line belongs to the passage when it heads a surah recited; another surah's is dimmed with its words. */
const headerOutside = (line: MushafLineData, ranges: readonly RecitedRange[]): boolean =>
  line.type !== 'ayah' && line.surahNumber !== undefined && !ranges.some((range) => range.surah === line.surahNumber);

/**
 * A page's opacity while it turns: `incoming` and `outgoing` are its sides of the staggered
 * dissolves into it and out of it (`dissolve()`), 1 outside them. `cut` turns nothing (its pages
 * never overlap).
 */
export const turnStyle = (turn: PageView['turn'], incoming: number, outgoing: number): React.CSSProperties =>
  turn === 'fade' && incoming * outgoing < 1 ? {opacity: Math.round(incoming * outgoing * 10_000) / 10_000} : {};

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
  /** What the page sits on (`groundOf()`): the band's strength depends on it. */
  readonly ground: string;
  readonly current: PageLineSlot | null;
  /** How much each printed line of this page is the current one (`pageLineEmphasis()`), by line number. */
  readonly emphasis: (line: number) => number;
  /** The video's metal (`metalOf()`): the border's rules. */
  readonly metal: string;
  /** The ranges followed (`rangesOf()`): one per surah recited. */
  readonly ranges: readonly RecitedRange[];
  readonly wordStyle: WordStyle;
  readonly activeProps: {readonly activeWordId: string | null; readonly inkTint?: string};
  readonly fontProps: FontProps;
};

/**
 * The current line's band, in its slot behind the line, a little wider than the measure: the band's
 * colour with its chroma capped, at the wash's faint strength on the ground (`washColor()`) times
 * `strength`, as it cross-fades from one line to the next.
 */
const LineMark: React.FC<{
  readonly pageView: PageView;
  readonly geometry: PageGeometry;
  readonly ground: string;
  readonly strength: number;
}> = ({pageView, geometry, ground, strength}) => {
  const {fontSize, padX} = geometry;
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
        background: washColor(pageView.lineHighlightColor, washAlpha(ground) * strength),
        borderRadius: Math.round(0.3 * fontSize),
      }}
    />
  );
};

/** One printed page: its border, every line in its row of the grid, the current one marked, the page number. */
const PageLeaf: React.FC<PageLeafProps> = ({
  slot,
  geometry,
  pageView,
  ground,
  current,
  emphasis,
  metal,
  ranges,
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
      {pageView.frame !== 'none' && <PageFrame frame={pageView.frame} geometry={geometry} color={metal} />}
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
          const strength = emphasis(line.line);
          // The other lines rest at dimOtherLines once a line is current; a line coming in or letting go eases.
          const dimOther = current === null ? 1 : 1 - (1 - pageView.dimOtherLines) * (1 - strength);
          const opacity = Math.round(dimOther * (headerOutside(line, ranges) ? OUTSIDE_OPACITY : 1) * 10_000) / 10_000;
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
              {strength > 0 && pageView.lineHighlight === 'band' && (
                <LineMark pageView={pageView} geometry={geometry} ground={ground} strength={strength} />
              )}
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
            opacity: 0.6,
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
 * the line being recited marked with a faint band that cross-fades from line to line (or, without
 * it, the words marked as `highlight` says), the words outside the ayahs followed at rest, and the
 * page dissolving to the next one after its last word (`pageTurns()`), filling 92 % of a wide frame's
 * height or 84 % of a tall one's width. Around it its `background`, the translations beside or
 * under the page (`text`, up to three stacked), the tajweed legend in its band and an end card
 * after the last ayah when asked; the audio normalised and faded as `audio` says. In the Studio, the
 * doubtful words are marked, the fonts and audio warnings shown, and the Mushaf panel docked.
 */
export const MushafPage: React.FC<WithPanelOption<MushafPageProps>> = ({panel = true, ...props}) => {
  const {audioFile, fonts, layout, highlight, review, pageView, text, legend, endCard, audio} = props;
  const {width, height, fps, durationInFrames, id} = useVideoConfig();
  const frame = useCurrentFrame();
  const isStudio = useInStudio();
  // Under hostAudio the template plays the recording: the composition plays none of its own.
  const ownAudio = audioFile !== '' && !followsHostAudio(props);
  const resolved = props.resolved as ResolvedPage | null;
  if (!resolved) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      'MushafPage: `resolved` is null. calculateMetadata fills it in: pass calculateMushafPageMetadata to <Composition calculateMetadata>, or resolve the props with resolvePage() for a <Player>.',
      {prop: 'resolved'},
    );
  }
  const {timings, pages} = resolved;
  // The rosettes of every page: a rosette timed as a word of its own is never a span of its own.
  const markers = useMemo(() => markerIds(pages.flatMap((page) => page.lines)), [pages]);
  const ranges = rangesOf(resolved);
  // The book serif and the Arabic labels: no frame is taken before they are in.
  useStudioFonts();
  const translationLayers = useTranslationLayers(text, translationsOf(resolved));
  // The frames before the end card: the audio fades out by their end, the last page stays to it.
  const cardFrames = endCardFrames(endCard, fps);
  const contentFrames = Math.max(1, durationInFrames - cardFrames);
  const curve = volumeCurveFor(audio, resolved.audio, contentFrames, fps);
  const now = frame / fps;
  const heard = wordAt(timings, now);
  const activeWordId = highlight.mode === 'none' ? null : heard;
  const theme = themeSelectionFrom(props.theme, props.customTheme);
  const ground = groundFor(props.background, layout);
  // With the band on, the band is the page's one mark: the words carry none of their own.
  const marked = pageView.lineHighlight === 'band' ? {...highlight, mode: 'none' as const} : highlight;
  const inkTint = inkTintFor(marked, theme, ground);
  const activeProps = inkTint === undefined ? {activeWordId} : {activeWordId, inkTint};
  const current = pageLineAt(resolved.lines, now);
  // The page is fitted around the legend's band, so the legend never covers a line.
  const reserve = legendReserve(legend, theme, {
    width,
    height,
    lineHeight: pageGeometry({width, height}).lineHeight,
    fontFamily: studioFontFamily(defaultOverlay.font, 'label'),
  });
  const geometry = pageGeometry({width, height}, reserve);
  const metal = metalOf({theme: props.theme, customTheme: props.customTheme, ground});
  const firstLine = pages[0]?.lines[0];
  const fontSetup = fontPropsFrom(fonts, firstLine?.fontSet ?? 'qpc-v4', staticFile);
  const starts = wordStarts(timings);
  const turnFrames = pageView.turn === 'cut' ? 0 : Math.max(1, Math.round(pageView.turnSeconds * fps));
  // Each turn after the outgoing page's last word; the staggered dissolve between the two pages.
  const turns = useMemo(
    () =>
      pageTurns(resolved, {
        fps,
        turnFrames,
        leadInSeconds: PAGE_LEAD_IN_SECONDS,
        occurrence: highlight.occurrence,
      }),
    [resolved, fps, turnFrames, highlight.occurrence],
  );
  const lineEmphasis = (page: number) => (line: number) => pageLineEmphasis(resolved.lines, page, line, frame, fps);

  const leaves = pages.map((slot, i) => {
    const into = turns[i - 1];
    const away = turns[i];
    // A page comes in over the incoming side of its turn and stays under the next one over the outgoing side.
    const from = into === undefined ? 0 : into.start + (into.duration === 0 ? 0 : dissolveShares(into.duration).in);
    const to =
      away === undefined ? contentFrames : away.start + (away.duration === 0 ? 0 : dissolveShares(away.duration).out);
    const incoming = into === undefined || into.duration === 0 ? 1 : dissolve(frame - into.start, into.duration).in;
    const outgoing = away === undefined || away.duration === 0 ? 1 : dissolve(frame - away.start, away.duration).out;
    const next = pages[i + 1];
    const wordStyle = dimmingOutside(
      wordStyleFrom({
        highlight: marked,
        review,
        doubtful: resolved.doubtful,
        timingsIndex: starts,
        timings,
        isStudio,
        sequenceFrom: from,
        theme,
        ink: layout.color,
        ground,
        markers,
      }),
      ranges,
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
        <AbsoluteFill style={turnStyle(pageView.turn, incoming, outgoing)}>
          <PageLeaf
            slot={slot}
            geometry={geometry}
            pageView={pageView}
            ground={ground}
            current={current}
            emphasis={lineEmphasis(slot.page)}
            metal={metal}
            ranges={ranges}
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
  const opening = passageSpan(timings).from;
  const ayahKey = ayahKeyOf(heard) ?? ayahAt(timings, now) ?? `${opening.surah}:${opening.ayah}`;
  // The page has no title overlay: its cards take the overlay's default font.
  const overlayFont = studioFontFamily(defaultOverlay.font, 'label');
  return (
    <AbsoluteFill style={{backgroundColor: layout.background, color: layout.color, overflow: 'hidden'}}>
      <MushafBackground
        background={{
          ...backgroundFor(props.background, layout),
          ...(resolved.backgroundVideoSeconds ? {videoSeconds: resolved.backgroundVideoSeconds} : {}),
        }}
        layout={layout}
      />
      {layout.frame === 'hairline' && <Jadwal metal={metal} ground={ground} />}
      {ownAudio && (
        <CompositionAudio
          src={recordingUrl(audioFile, resolved, staticFile)}
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
          <TranslationStack layers={readableLayers(translationLayers, layout.color, ground)} ayahKey={ayahKey} />
        </div>
      )}
      <LegendBand
        legend={legend}
        theme={theme}
        fontFamily={overlayFont}
        color={layout.color}
        width={width}
        height={height}
        lineHeight={geometry.lineHeight}
      />
      <CompositionEndCard
        endCard={endCard}
        content={resolved.endCard}
        timings={timings}
        translations={translationLayers.map((layer) => layer.translation)}
        reciter=""
        from={contentFrames}
        durationInFrames={cardFrames}
        font={defaultOverlay.font}
        color={layout.color}
        background={ground}
        metal={metal}
        measure={geometry.measure}
        glyphSize={geometry.fontSize}
        lineHeight={geometry.lineHeight}
        fontProps={fontSetup.props}
        width={width}
        height={height}
      />
      {isStudio && <StudioWarnings warnings={[fontSetup.warning, resolved.audioWarning]} />}
      {isStudio && panel && <MushafStudioPanel compositionId={id} props={props} />}
    </AbsoluteFill>
  );
};
