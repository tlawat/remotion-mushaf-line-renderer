import {MushafLine, MushafLineWindow} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {AbsoluteFill, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {backgroundFor, groundFor} from '../../background/compat';
import {Jadwal} from '../../background/Jadwal';
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
  SINE,
  tempoFrames,
  windowScrollTiming,
} from '../../schema';
import {useInStudio} from '../../studio/environment';
import {ayahCount} from '../../studio/surahs';
import {TranslationStack} from '../../translations';
import {useStudioFonts} from '../fonts';
import {drawnTranslationLayers, StudioWarnings, translationsOf, useTranslationLayers} from '../parts';
import {linesPresence, shownAyahAt} from '../recitation/transitions';
import {blockGeometry, linesBlockStyle, translationBlockStyle, translationLayoutFor} from '../shared';
import {passageAyahChanges, passageEndFade, passageTimeline, type ResolvedPassage} from './resolve';
import type {MushafPassageProps} from './schema';

/**
 * A text-only passage, no audio: each line holds `holdSeconds`, through a window (the window
 * scrolls a line every hold) or one at a time (a line gives way to the next by the staggered
 * dissolve), with the translation of the ayah the current line starts with; the surah's header
 * lines first when asked for and the passage starts at ayah 1, and a title card (the lines start
 * after it) and corner label, over its `background`, with up to three translations stacked. Every
 * change runs at the incoming line's hold start (nothing is heard to wait for, render-design.md
 * 5.2): the lines appear over `windowIn` on `SINE`, give way by the line dissolve, and fade over
 * `endFade` after the last hold; the translation and the corner number dissolve to the next ayah
 * from the same frame (`passageAyahChanges()`), and come and go with the lines.
 */
export const MushafPassage: React.FC<MushafPassageProps> = (props) => {
  const {fonts, layout, animation, text, overlay} = props;
  const {width, height, fps} = useVideoConfig();
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
  const {starts, end} = passageTimeline(lines, props, fps);

  const geometry = blockGeometry(layout, {width, height});
  const {fontSize, lineHeight, slots} = geometry;

  const fontSetup = fontPropsFrom(fonts, lines[0]?.fontSet ?? 'qpc-v4', staticFile);
  // A line gives way to the next at the next one's hold start (nothing is heard to wait for), by
  // the staggered dissolve: the outgoing line ends `out` frames after it, the incoming one comes in from `in`.
  const cut = animation.lines === 'cut';
  const dissolveFrames = cut ? 0 : tempoFrames('lineDissolve', animation.tempo, fps);
  const shares = cut ? {out: 0, in: 0} : dissolveShares(dissolveFrames);
  // The lines appear with the first hold over `windowIn`, and fade over `endFade` after the last one.
  const appear = starts[0] ?? 0;
  const windowIn = cut ? 0 : tempoFrames('windowIn', animation.tempo, fps);
  const endFade = passageEndFade(animation, fps);
  const linesEnd = end + endFade;

  let linesBlock: React.ReactNode;
  if (layout.visibleLines === 0) {
    linesBlock = lines.map((line, i) => {
      const last = i === lines.length - 1;
      const from = i === 0 ? appear : starts[i]! + shares.in;
      const until = last ? linesEnd : starts[i + 1]! + shares.out;
      const motion = animationFrom(animation, {
        fontSize,
        ...(i === 0 ? {enterFrames: windowIn, enterEasing: SINE} : {enterFrames: dissolveFrames - shares.in}),
        exitFrames: last ? endFade : shares.out,
      });
      return (
        <Sequence
          key={`${line.page}/${line.line}`}
          from={from}
          durationInFrames={Math.max(1, until - from)}
          premountFor={fps}
          name={`p${line.page} l${line.line} (${line.words[0]?.id ?? line.type})`}
        >
          <MushafLine line={line} fontSize={fontSize} lineHeight={lineHeight} {...motion} {...fontSetup.props} />
        </Sequence>
      );
    });
  } else {
    // One window from the first hold (after the intro card, when it is on) to the end of its fade:
    // each step starts at its line's hold (`anchor: 'start'`), one calm scroll long.
    linesBlock = (
      <Sequence
        from={appear}
        durationInFrames={Math.max(1, linesEnd - appear)}
        premountFor={fps}
        name={`${lines.length} lines, ${slots} at once`}
      >
        <MushafLineWindow
          lines={lines}
          steps={starts.map((start) => start - appear)}
          anchor="start"
          scrollTiming={windowScrollTiming(animation, fps)}
          visibleLines={slots}
          neighbourOpacity={layout.neighbourOpacity}
          fontSize={fontSize}
          lineHeight={lineHeight}
          {...animationFrom(animation, {fontSize, enterFrames: windowIn, exitFrames: endFade, enterEasing: SINE})}
          {...fontSetup.props}
        />
      </Sequence>
    );
  }

  // The ayah on screen: the translation dissolves to the next one at the incoming line's hold start,
  // over `translationDissolve`; the corner number over `labelChange` from the same frame.
  const changes = passageAyahChanges(lines, {starts}, animation, fps);
  const shown = shownAyahAt(changes, frame);
  const label = shownAyahAt(changes, frame, tempoFrames('labelChange', animation.tempo, fps));
  // The translation comes and goes with the lines: in with their first appearance, out with their end fade.
  const presence = linesPresence(frame, {appear, windowIn, end: linesEnd, endFade});
  const showTranslation = translationLayers.length > 0 && text.translationPosition !== 'none';
  return (
    <AbsoluteFill style={{backgroundColor: layout.background, color: layout.color}}>
      <MushafBackground
        background={{
          ...backgroundFor(props.background, layout),
          ...(resolved.backgroundVideoSeconds ? {videoSeconds: resolved.backgroundVideoSeconds} : {}),
        }}
        layout={layout}
      />
      {layout.frame === 'hairline' && (
        <Jadwal metal={metalOf({theme: props.theme, customTheme: props.customTheme, ground})} ground={ground} />
      )}
      <div data-mushaf-block="Mushaf lines" style={linesBlockStyle(geometry, layout)}>
        {linesBlock}
      </div>
      {showTranslation && (
        <div data-mushaf-block="Translation" style={translationBlockStyle(geometry, layout, text, height)}>
          <TranslationStack
            layers={drawnTranslationLayers(translationLayers, {ink: layout.color, ground, glyphSize: fontSize})}
            ayahKey={shown.key}
            outgoing={shown.outgoing ? {ayahKey: shown.outgoing.key, opacity: shown.outgoing.opacity} : null}
            textOpacity={shown.opacity}
            opacity={presence}
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
        ayahKey={label.key}
        ayahChange={label}
        firstWordSeconds={null}
        // The lines start after the card (`passageTimeline()`): it has its whole time on the ground.
        addsTime
        background={ground}
        tempo={animation.tempo}
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
