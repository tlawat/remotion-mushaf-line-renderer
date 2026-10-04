import {exitTiming, MushafLine, MushafLineWindow} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {AbsoluteFill, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {backgroundFor} from '../../background/compat';
import {MushafBackground} from '../../background/MushafBackground';
import {MushafStudioError} from '../../errors';
import {MushafTitleOverlay} from '../../overlay';
import {animationFrom, fontPropsFrom, scrollTimingFrom} from '../../schema';
import {useInStudio} from '../../studio/environment';
import {ayahCount} from '../../studio/surahs';
import {TranslationStack} from '../../translations';
import {StudioWarnings, translationsOf, useTranslationLayers} from '../parts';
import {blockGeometry, firstAyahKey, linesBlockStyle, translationBlockStyle} from '../shared';
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
  const translationLayers = useTranslationLayers(text, translationsOf(resolved));
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
  const animationProps = animationFrom(animation, {visibleLines: slots});

  let linesBlock: React.ReactNode;
  if (layout.visibleLines === 0) {
    // Line i takes the box as line i-1 leaves: its exit runs over the last frames of its hold, and
    // the last line gets its exit after its hold so it leaves on screen.
    linesBlock = lines.map((line, i) => (
      <Sequence
        key={`${line.page}/${line.line}`}
        from={starts[i]!}
        durationInFrames={i === lines.length - 1 ? holds[i]! + exitFrames : holds[i]!}
        premountFor={fps}
        name={`p${line.page} l${line.line} (${line.words[0]?.id ?? line.type})`}
      >
        <MushafLine line={line} fontSize={fontSize} lineHeight={lineHeight} {...animationProps} {...fontSetup.props} />
      </Sequence>
    ));
  } else {
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
          scrollTiming={scrollTimingFrom(animation.scroll)}
          visibleLines={slots}
          neighbourOpacity={layout.neighbourOpacity}
          fontSize={fontSize}
          lineHeight={lineHeight}
          {...animationProps}
          {...fontSetup.props}
        />
      </Sequence>
    );
  }

  const showTranslation = translationLayers.length > 0 && text.translationPosition !== 'none';
  return (
    <AbsoluteFill style={{backgroundColor: layout.background, color: layout.color}}>
      {/* No audio here: the glow, if any, stays at rest. */}
      <MushafBackground
        background={{
          ...backgroundFor(props.background, layout),
          ...(resolved.backgroundVideoSeconds ? {videoSeconds: resolved.backgroundVideoSeconds} : {}),
        }}
        glowY={layout.verticalAlign}
      />
      <div data-mushaf-block="Mushaf lines" style={linesBlockStyle(geometry, layout)}>
        {linesBlock}
      </div>
      {showTranslation && (
        <div data-mushaf-block="Translation" style={translationBlockStyle(geometry, layout, text, height)}>
          <TranslationStack layers={translationLayers} ayahKey={firstAyahKey(lines[current])} />
        </div>
      )}
      <MushafTitleOverlay
        overlay={overlay}
        surah={props.surah}
        fromAyah={props.fromAyah}
        toAyah={props.toAyah === 0 ? Math.max(props.fromAyah, ayahCount(props.surah)) : props.toAyah}
        ayahKey={firstAyahKey(lines[current])}
        firstWordSeconds={null}
        background={layout.background}
        fontSize={fontSize}
        lineHeight={lineHeight}
        width={geometry.measure}
        fontProps={fontSetup.props}
      />
      {isStudio && <StudioWarnings warnings={[fontSetup.warning]} />}
    </AbsoluteFill>
  );
};
