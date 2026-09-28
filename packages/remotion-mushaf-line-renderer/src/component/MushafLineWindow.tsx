import type * as React from 'react';
import {useRef} from 'react';
import {Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import {getEnterState, getExitState, normaliseAnimation} from '../animation/animation-state';
import {scrollPosition} from '../animation/scroll-position';
import {describeValue, MushafError} from '../errors';
import {assertLineData} from '../resolve/validate-line-data';
import type {LineWindowContext, MushafLineWindowProps} from '../types';
import {useCanvasGuard} from './hooks/use-canvas-guard';
import {renderLine} from './MushafLine';
import {Presented} from './Presented';
import {
  assertSize,
  buildSlotStyle,
  buildTrackStyle,
  buildWindowStyle,
  fontSizeForWidth,
  lineHeightForFontSize,
  windowEdgeOpacity,
  windowEmphasisOpacity,
} from './styles';

const DEFAULT_VISIBLE_LINES = 3;
const DEFAULT_NEIGHBOUR_OPACITY = 0.45;
const DEFAULT_PRELOAD_LINES = 2;

/**
 * The lines a window at `position` mounts, as `[first, last]`: those with an edge opacity above 0
 * (a distance of less than half the window plus one), and `preloadLines` more below the window so
 * their page fonts load before they scroll in. Lines above the window unmount as soon as they have
 * left it. Pure in the position, so every frame at the same position renders the same tree.
 */
export const mountedRange = (
  position: number,
  lineCount: number,
  visibleLines: number,
  preloadLines: number,
): readonly [first: number, last: number] => {
  const half = (visibleLines + 1) / 2;
  return [
    Math.max(0, Math.floor(position - half) + 1),
    Math.min(lineCount - 1, Math.ceil(position + half) - 1 + preloadLines),
  ];
};

const bad = (problem: string, details?: Record<string, unknown>): never => {
  throw new MushafError('BAD_WINDOW_PROP', `<MushafLineWindow> ${problem}`, details);
};

const assertPositiveInteger = (name: string, value: unknown): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    bad(`\`${name}\` must be a positive integer, got ${describeValue(value)}.`, {[name]: value});
  }
  return value as number;
};

const assertNonNegativeInteger = (name: string, value: unknown): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    bad(`\`${name}\` must be an integer >= 0, got ${describeValue(value)}.`, {[name]: value});
  }
  return value as number;
};

/**
 * A window of `visibleLines` slots onto a stack of lines, the current line in the middle slot.
 *
 * The window is scrolled to a *position*, a fractional line index: `steps` (the local frame at which
 * each line becomes current) are turned into one by `scrollPosition()`, or `position` is given
 * directly. One transform on the track moves every line together, so a change of the current line
 * is one shared scroll of exactly one line-height, never an entrance here and an exit there. Lines
 * fade across the window edge, and the lines that are not current are dimmed to `neighbourOpacity`
 * by the default `lineStyle`; both follow the position, so the emphasis travels with the scroll.
 *
 * - Timing comes from the enclosing `<Sequence from>`, like `<MushafLine>`; `enter` / `exit`
 *   animate the whole window.
 * - Only the lines that can be inside the window (plus `preloadLines` below it) are mounted, so
 *   the tree is a function of the position alone; every line still waits for its page font.
 * - The root is a normal-flow block of `visibleLines × lineHeight`; position it with `style` or the
 *   enclosing `<Sequence style>`.
 */
export const MushafLineWindow: React.FC<MushafLineWindowProps> = (props) => {
  const {
    lines,
    visibleLines: visibleLinesProp = DEFAULT_VISIBLE_LINES,
    neighbourOpacity = DEFAULT_NEIGHBOUR_OPACITY,
    preloadLines: preloadLinesProp = DEFAULT_PRELOAD_LINES,
    lineStyle,
    lineClassName,
    enter: enterProp,
    exit: exitProp,
    fit,
    fontSize,
    lineHeight,
    style,
    className,
    name,
    framed,
    activeWordId,
    activeWordStyle,
    wordStyle,
    wordClassName,
    fontSrc,
    fontFallback,
  } = props;
  const enter = normaliseAnimation('enter', enterProp);
  const exit = normaliseAnimation('exit', exitProp);
  const {width, fps, durationInFrames} = useVideoConfig(); // durationInFrames is the enclosing Sequence's
  const frame = useCurrentFrame(); // local to the enclosing <Sequence from>; 0 while premounted
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const canvas = useCanvasGuard({hasPresentation: Boolean(enter || exit), rootRef, rowRef: trackRef});

  // ---- hooks done; validation and throws below ----
  if (canvas.error) throw canvas.error;
  if (!Array.isArray(lines)) bad(`expects \`lines\` to be an array of MushafLineData, got ${describeValue(lines)}.`);
  const visibleLines = assertPositiveInteger('visibleLines', visibleLinesProp);
  const preloadLines = assertNonNegativeInteger('preloadLines', preloadLinesProp);
  if (typeof neighbourOpacity !== 'number' || !(neighbourOpacity >= 0 && neighbourOpacity <= 1)) {
    bad(`\`neighbourOpacity\` must be a number from 0 to 1, got ${describeValue(neighbourOpacity)}.`, {
      neighbourOpacity,
    });
  }
  const hasSteps = props.steps !== undefined;
  const hasPosition = props.position !== undefined;
  if (hasSteps === hasPosition) {
    bad(
      hasSteps
        ? 'takes either `steps` or `position`, not both.'
        : 'needs `steps` (the frame at which each line becomes current) or a `position`.',
    );
  }
  let position: number;
  if (props.steps !== undefined) {
    if (Array.isArray(props.steps) && props.steps.length !== lines.length) {
      bad(`\`steps\` must have one entry per line: ${props.steps.length} steps for ${lines.length} lines.`, {
        steps: props.steps.length,
        lines: lines.length,
      });
    }
    position = scrollPosition({frame, fps, steps: props.steps, timing: props.scrollTiming, anchor: props.anchor});
  } else {
    const given = props.position;
    if (typeof given !== 'number' || !Number.isFinite(given)) {
      bad(`\`position\` must be a finite number (a fractional line index), got ${describeValue(given)}.`, {
        position: given,
      });
    }
    position = given as number;
  }

  const baseFontSize = assertSize('fontSize', fontSize ?? fontSizeForWidth(width, lines[0]?.mushaf));
  const resolvedLineHeight = assertSize('lineHeight', lineHeight ?? lineHeightForFontSize(baseFontSize));
  const enterState = enter ? getEnterState({enter, frame, fps}) : null;
  const exitState = exit ? getExitState({exit, frame, fps, durationInFrames}) : null;

  const [first, last] = mountedRange(position, lines.length, visibleLines, preloadLines);
  const current = Math.round(position);
  const slots: React.ReactNode[] = [];
  for (let index = first; index <= last; index++) {
    const line = assertLineData(lines[index]);
    const distance = Math.abs(index - position);
    const context: LineWindowContext = {
      line,
      index,
      position,
      distance,
      current: index === current,
      frame,
      fps,
    };
    const extraStyle = lineStyle?.(line, context);
    const extraClass = lineClassName?.(line, context);
    slots.push(
      <div
        key={`${index}/${line.page}/${line.line}`}
        className="mushaf-line-window__slot"
        data-index={index}
        data-current={index === current ? 'true' : undefined}
        data-distance={distance.toFixed(4)}
        style={buildSlotStyle(index, visibleLines, resolvedLineHeight, windowEdgeOpacity(distance, visibleLines))}
      >
        {renderLine(line, {
          // The default lineStyle, under the caller's: its `opacity` wins when it sets one.
          style: {opacity: windowEmphasisOpacity(distance, neighbourOpacity), ...extraStyle},
          className: extraClass,
          enter: undefined,
          exit: undefined,
          fit,
          slice: undefined,
          fontSize: baseFontSize,
          lineHeight: resolvedLineHeight,
          activeWordId,
          activeWordStyle,
          wordStyle,
          wordClassName,
          framed,
          fontSrc,
          fontFallback,
        })}
      </div>,
    );
  }

  const track = (
    <div ref={trackRef} className="mushaf-line-window__track" style={buildTrackStyle(position, resolvedLineHeight)}>
      {slots}
    </div>
  );
  // Nested exactly as <LineRenderer> nests them: the exiting presentation wraps the entering one.
  let presented: React.ReactNode = track;
  if (enter && enterState) {
    presented = (
      <Presented
        presentation={enter.presentation}
        direction="entering"
        progress={enterState.progress}
        durationInFrames={enterState.durationInFrames}
        onElementImage={canvas.onElementImage}
        bothEnteringAndExiting={Boolean(exit)}
      >
        {presented}
      </Presented>
    );
  }
  if (exit && exitState) {
    presented = (
      <Presented
        presentation={exit.presentation}
        direction="exiting"
        progress={exitState.progress}
        durationInFrames={exitState.durationInFrames}
        onElementImage={canvas.onElementImage}
        bothEnteringAndExiting={Boolean(enter)}
      >
        {presented}
      </Presented>
    );
  }

  const body = (
    <div
      ref={rootRef}
      className={className ? `mushaf-line-window ${className}` : 'mushaf-line-window'}
      data-visible-lines={visibleLines}
      data-position={position.toFixed(4)}
      data-current={current}
      style={buildWindowStyle(visibleLines, resolvedLineHeight, style)}
    >
      {presented}
    </div>
  );
  // layout="none" adds no wrapper element (so `style` stays on our root) and never premounts.
  return name === undefined ? (
    body
  ) : (
    <Sequence layout="none" name={name}>
      {body}
    </Sequence>
  );
};
