import type * as React from 'react';
import {Sequence} from 'remotion';
import {describeValue, MushafError} from '../errors';
import {assertSlice} from '../resolve/slice';
import {assertLineData} from '../resolve/validate-line-data';
import type {MushafDataOptions, MushafLineData, MushafLineProps, MushafSelection} from '../types';
import {HeaderLine} from './HeaderLine';
import {LineRenderer, type LineRendererProps} from './LineRenderer';
import {ResolveLine} from './ResolveLine';

/** Options that only mean something while a line is being resolved, so they are refused next to resolved data. */
const RESOLVE_ONLY: Readonly<Record<'theme' | 'mushaf' | 'data', string>> = {
  theme:
    'Resolved line data already carries its mushaf and theme, so `theme` cannot be set alongside `line={MushafLineData}`. Pass `theme` to getMushafLine() / getMushafLines() where the data is resolved.',
  mushaf:
    'Resolved line data already carries its mushaf and theme, so `mushaf` cannot be set alongside `line={MushafLineData}`. Pass `mushaf` to getMushafLine() / getMushafLines() where the data is resolved.',
  data: 'Resolved line data is already loaded, so `data` cannot be set alongside `line={MushafLineData}`. Pass `data` to getMushafLine() / getMushafLines() where the data is resolved.',
};

/**
 * Renders one line of the mushaf, pixel-faithful to the printed page.
 *
 * - Timing comes from the enclosing `<Sequence from>`: the entrance runs over the local frame.
 * - Pass `line` (from `getMushafLine()`, ideally resolved in `calculateMetadata()`), or
 *   `page` + `line` (+ optional `mushaf` / `theme` / `data`) to resolve at render time behind
 *   `delayRender()`.
 * - The root is a normal-flow block of height `lineHeight` (default 2.2 × fontSize); stack fifteen
 *   of them for a page, or position one with `style` / the enclosing `<Sequence style>`.
 * - Nothing is painted until the page font is loaded (a fallback font would show wrong words).
 * - `surah_name` lines set the surah's name in its printed frame and `basmallah` lines the basmalah,
 *   from QUL's surah-name and quran-common fonts (see `renderLine`).
 */
export const MushafLine: React.FC<MushafLineProps> = (props) => {
  const {
    name,
    style,
    className,
    enter,
    exit,
    fit,
    slice,
    fontSize,
    lineHeight,
    activeWordId,
    activeWordStyle,
    wordStyle,
    wordClassName,
    framed,
    fontSrc,
    fontFallback,
  } = props;
  if (slice !== undefined && slice !== null) assertSlice('<MushafLine slice>', slice);
  const common = {
    style,
    className,
    enter,
    exit,
    fit,
    slice,
    fontSize,
    lineHeight,
    activeWordId,
    activeWordStyle,
    wordStyle,
    wordClassName,
    framed,
    fontSrc,
    fontFallback,
  };
  let body: React.ReactElement;
  if (typeof props.line === 'number') {
    const {mushaf, theme, page, line, data} = props as MushafSelection &
      MushafDataOptions & {page: number; line: number};
    body = <ResolveLine mushaf={mushaf} theme={theme} page={page} line={line} data={data} {...common} />;
  } else if (props.line !== null && typeof props.line === 'object') {
    for (const key of ['theme', 'mushaf', 'data'] as const) {
      const value = (props as Record<string, unknown>)[key];
      if (value !== undefined) throw new MushafError('BAD_LINE_PROP', RESOLVE_ONLY[key], {[key]: value});
    }
    body = renderLine(assertLineData(props.line), common);
  } else {
    throw new MushafError(
      'BAD_LINE_PROP',
      `<MushafLine> expects either line={MushafLineData} (from getMushafLine()) or page + line={number}; got line of type ${describeValue(props.line)}.`,
    );
  }
  // layout="none" adds no wrapper element (so `style` stays on our root) and never premounts.
  return name === undefined ? (
    body
  ) : (
    <Sequence layout="none" name={name}>
      {body}
    </Sequence>
  );
};

/**
 * The renderer for a resolved line: words for an `ayah` line, the shared-font glyphs for a
 * `surah_name` or `basmallah` line. Keyed by what decides the fonts, so a line that changes page or
 * type remounts with fresh hooks.
 */
export const renderLine = (line: MushafLineData, common: Omit<LineRendererProps, 'line'>): React.ReactElement => {
  const key = `${line.mushaf}/${line.fontSet}/${line.page}/${line.line}/${line.type}`;
  return line.type === 'ayah' ? (
    <LineRenderer key={key} line={line} {...common} />
  ) : (
    <HeaderLine key={key} line={line} {...common} />
  );
};
