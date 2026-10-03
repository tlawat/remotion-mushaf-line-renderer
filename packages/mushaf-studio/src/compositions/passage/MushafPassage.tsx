import {
  exitTiming,
  fontSizeForWidth,
  lineHeightForFontSize,
  MushafLine,
  MushafLineWindow,
} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {
  AbsoluteFill,
  getRemotionEnvironment,
  Img,
  Interactive,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {MushafStudioError} from '../../errors';
import {animationFrom, fontPropsFrom, scrollTimingFrom} from '../../schema';
import {TranslationBlock} from '../../translations';
import {fileUrl, firstAyahKey} from '../shared';
import type {ResolvedPassage} from './resolve';
import type {MushafPassageProps} from './schema';

const BACKGROUND_IMAGE_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

const WARNING_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  padding: '0.4em 1em',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 22,
  lineHeight: 1.3,
  color: '#7a2e0e',
  background: 'rgba(255, 232, 204, 0.92)',
};

/**
 * A text-only passage, no audio: each line holds `holdSeconds`, through a window (the window
 * scrolls a line every hold) or one at a time (a line leaves as the next one enters), with the
 * translation of the ayah the current line starts with.
 */
export const MushafPassage: React.FC<MushafPassageProps> = (props) => {
  const {fonts, layout, animation, text, holdSeconds} = props;
  const {width, height, fps, durationInFrames} = useVideoConfig();
  const frame = useCurrentFrame();
  const {isStudio} = getRemotionEnvironment();
  const resolved = props.resolved as ResolvedPassage | null;
  if (!resolved) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      'MushafPassage: `resolved` is null. calculateMetadata fills it in: pass calculateMushafPassageMetadata to <Composition calculateMetadata>, or resolve the props with resolvePassage() for a <Player>.',
      {prop: 'resolved'},
    );
  }
  const {lines} = resolved;
  const holdFrames = Math.max(1, Math.round(holdSeconds * fps));
  const current = Math.max(0, Math.min(lines.length - 1, Math.floor(frame / holdFrames)));

  const measure = width - 2 * layout.marginX;
  const fontSize = fontSizeForWidth(measure);
  const lineHeight = lineHeightForFontSize(fontSize);
  const slots = layout.visibleLines === 0 ? 1 : layout.visibleLines;
  const blockHeight = slots * lineHeight;
  const top = Math.round((height - blockHeight) * layout.verticalAlign);
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
        from={i * holdFrames}
        durationInFrames={i === lines.length - 1 ? holdFrames + exitFrames : holdFrames}
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
          steps={lines.map((_, i) => i * holdFrames)}
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

  const translationGap = Math.round(text.translationSize * 0.6);
  const showTranslation = resolved.translation !== null && text.translationPosition !== 'none';
  return (
    <AbsoluteFill style={{backgroundColor: layout.background, color: layout.color}}>
      {layout.backgroundImage !== '' && (
        <Img src={fileUrl(layout.backgroundImage, staticFile)} style={BACKGROUND_IMAGE_STYLE} />
      )}
      <Interactive.Div
        name="Mushaf lines"
        style={{position: 'absolute', top, left: layout.marginX, width: measure, height: blockHeight}}
      >
        {linesBlock}
      </Interactive.Div>
      {showTranslation && (
        <Interactive.Div
          name="Translation"
          style={
            text.translationPosition === 'above'
              ? {position: 'absolute', left: layout.marginX, width: measure, bottom: height - top + translationGap}
              : {position: 'absolute', left: layout.marginX, width: measure, top: top + blockHeight + translationGap}
          }
        >
          <TranslationBlock
            translation={resolved.translation!}
            ayahKey={firstAyahKey(lines[current])}
            fontFamily={text.translationFont}
            fontSize={text.translationSize}
            color={text.translationColor}
            direction={text.translationDirection}
          />
        </Interactive.Div>
      )}
      {isStudio && fontSetup.warning !== null && <div style={WARNING_STYLE}>Mushaf Studio: {fontSetup.warning}</div>}
    </AbsoluteFill>
  );
};
