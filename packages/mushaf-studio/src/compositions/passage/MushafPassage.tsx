import {exitTiming, MushafLine, MushafLineWindow} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {AbsoluteFill, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {backgroundFor, groundFor} from '../../background/compat';
import {MushafBackground} from '../../background/MushafBackground';
import {MushafStudioError} from '../../errors';
import {MushafTitleOverlay} from '../../overlay';
import {
  animationFrom,
  dissolveShares,
  fontPropsFrom,
  frameGeometry,
  metalOf,
  readableInk,
  tempoFrames,
  windowScrollTiming,
} from '../../schema';
import {useInStudio} from '../../studio/environment';
import {ayahCount} from '../../studio/surahs';
import {TranslationStack} from '../../translations';
import {useStudioFonts} from '../fonts';
import {drawnTranslationLayers, StudioWarnings, translationsOf, useTranslationLayers} from '../parts';
import {blockGeometry, firstAyahKey, linesBlockStyle, translationBlockStyle, translationLayoutFor} from '../shared';
import {passageTimeline, type ResolvedPassage} from './resolve';
import type {MushafPassageProps} from './schema';

/**
 * A text-only passage, no audio: each line holds `holdSeconds`, through a window (the window
 * scrolls a line every hold) or one at a time (a line leaves as the next one enters), with the
 * translation of the ayah the current line starts with; the surah's header lines first when asked
 * for and the passage starts at ayah 1, and a title card (the lines start after it) and corner label,
 * over its `background` (no audio: a glow stays at rest), with up to three translations stacked.
 */
export const MushafPassage: React.FC<MushafPassageProps> = (props) => {
  const {fonts, layout, animation, text, overlay} = props;
  const {width, height, fps, durationInFrames} = useVideoConfig();
  const frame = useCurrentFrame();
  const isStudio = useInStudio();
  const resolved = props.resolved as ResolvedPassage | null;
  if (!resolved) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      'MushafPassage: `resolved` is null. calculateMetadata fills it in: pass calculateMushafPassageMetadata to <Composition calculateMetadata>, or resolve the props with resolvePassage() for a <Player>.',
      {prop: 'resolved'},
    );
  }
  const {lines} = resolved;
  // The book serif and the Arabic labels: no frame is taken before they are in.
  useStudioFonts();
  const translationLayers = useTranslationLayers(text, translationsOf(resolved));
  // What the text sits on: a translation or label colour under 4.5:1 there gives way to a muted ink.
  const ground = groundFor(props.background, layout);
  const {starts, holds} = passageTimeline(lines, props, fps);
  // The line on screen: the last one whose hold has begun, else the first.
  let current = 0;
  starts.forEach((start, i) => {
    if (start <= frame) current = i;
  });

  const geometry = blockGeometry(layout, {width, height});
  const {fontSize, lineHeight, slots} = geometry;
  const exitFrames = exitTiming().getDurationInFrames({fps});

  const fontSetup = fontPropsFrom(fonts, lines[0]?.fontSet ?? 'qpc-v4', staticFile);
  // A line gives way to the next at the next one's hold start (nothing is heard to wait for), by
  // the staggered dissolve: the outgoing line ends `out` frames after it, the incoming one comes in from `in`.
  const cut = animation.lines === 'cut';
  const dissolveFrames = cut ? 0 : tempoFrames('lineDissolve', animation.tempo, fps);
  const shares = cut ? {out: 0, in: 0} : dissolveShares(dissolveFrames);

  let linesBlock: React.ReactNode;
  if (layout.visibleLines === 0) {
    linesBlock = lines.map((line, i) => {
      const last = i === lines.length - 1;
      const from = i === 0 ? starts[0]! : starts[i]! + shares.in;
      const end = last ? starts[i]! + holds[i]! + exitFrames : starts[i + 1]! + shares.out;
      const motion = animationFrom(animation, {
        fontSize,
        ...(i === 0 ? {} : {enterFrames: dissolveFrames - shares.in}),
        exitFrames: last ? exitFrames : shares.out,
      });
      return (
        <Sequence
          key={`${line.page}/${line.line}`}
          from={from}
          durationInFrames={Math.max(1, end - from)}
          premountFor={fps}
          name={`p${line.page} l${line.line} (${line.words[0]?.id ?? line.type})`}
        >
          <MushafLine line={line} fontSize={fontSize} lineHeight={lineHeight} {...motion} {...fontSetup.props} />
        </Sequence>
      );
    });
  } else {
    // Each step starts at its line's hold (`anchor: 'start'`), one calm scroll long.
    linesBlock = (
      <Sequence
        from={0}
        durationInFrames={durationInFrames}
        premountFor={fps}
        name={`${lines.length} lines, ${slots} at once`}
      >
        <MushafLineWindow
          lines={lines}
          steps={starts}
          anchor="start"
          scrollTiming={windowScrollTiming(animation, fps)}
          visibleLines={slots}
          neighbourOpacity={layout.neighbourOpacity}
          fontSize={fontSize}
          lineHeight={lineHeight}
          {...animationFrom(animation, {fontSize})}
          {...fontSetup.props}
        />
      </Sequence>
    );
  }

  const showTranslation = translationLayers.length > 0 && text.translationPosition !== 'none';
  return (
    <AbsoluteFill style={{backgroundColor: layout.background, color: layout.color}}>
      <MushafBackground
        background={{
          ...backgroundFor(props.background, layout),
          ...(resolved.backgroundVideoSeconds ? {videoSeconds: resolved.backgroundVideoSeconds} : {}),
        }}
      />
      <div data-mushaf-block="Mushaf lines" style={linesBlockStyle(geometry, layout)}>
        {linesBlock}
      </div>
      {showTranslation && (
        <div data-mushaf-block="Translation" style={translationBlockStyle(geometry, layout, text, height)}>
          <TranslationStack
            layers={drawnTranslationLayers(translationLayers, {ink: layout.color, ground, glyphSize: fontSize})}
            ayahKey={firstAyahKey(lines[current])}
            layout={translationLayoutFor(geometry)}
            ruleThickness={Math.max(1, frameGeometry(width, height).unit)}
          />
        </div>
      )}
      <MushafTitleOverlay
        overlay={{...overlay, color: readableInk(overlay.color, layout.color, ground)}}
        surah={props.surah}
        fromAyah={props.fromAyah}
        toAyah={props.toAyah === 0 ? Math.max(props.fromAyah, ayahCount(props.surah)) : props.toAyah}
        ayahKey={firstAyahKey(lines[current])}
        firstWordSeconds={null}
        // The lines start after the card (`passageTimeline()`): it has its whole time on the ground.
        addsTime
        background={ground}
        fontSize={fontSize}
        lineHeight={lineHeight}
        width={geometry.measure}
        metal={metalOf({theme: props.theme, customTheme: props.customTheme, ground})}
        translationName={showTranslation ? (translationLayers[0]?.translation.meta.name ?? null) : null}
        fontProps={fontSetup.props}
      />
      {isStudio && <StudioWarnings warnings={[fontSetup.warning]} />}
    </AbsoluteFill>
  );
};
