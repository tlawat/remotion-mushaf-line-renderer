import * as React from 'react';
import {Sequence} from 'remotion';
import {MushafError, describeValue} from './errors';
import {LineRenderer} from './internal/LineRenderer';
import {ResolveLine} from './internal/ResolveLine';
import type {MushafId, MushafLineProps} from './types';
import {assertLineData} from './validate-line-data';

/**
 * Renders one line of the mushaf, pixel-faithful to the printed page.
 *
 * - Timing comes from the enclosing `<Sequence from>`: the entrance runs over the local frame.
 * - Pass `line` (from `getMushafLine()`, ideally resolved in `calculateMetadata()`), or
 *   `mushaf` + `page` + `line` to resolve at render time behind `delayRender()`.
 * - The root is a normal-flow block of height `lineHeight` (default 2.2 × fontSize); stack fifteen
 *   of them for a page, or position one with `style` / the enclosing `<Sequence style>`.
 * - Nothing is painted until the page font is loaded (a fallback font would show wrong words).
 */
export const MushafLine: React.FC<MushafLineProps> = (props) => {
  const {name, style, className, enter, fontSize, lineHeight} = props;
  const common = {style, className, enter, fontSize, lineHeight};
  let body: React.ReactElement;
  if (typeof props.line === 'number') {
    const {mushaf, page, line} = props as {mushaf: MushafId; page: number; line: number};
    body = <ResolveLine mushaf={mushaf} page={page} line={line} {...common} />;
  } else if (props.line !== null && typeof props.line === 'object') {
    const line = assertLineData(props.line);
    body = <LineRenderer key={`${line.mushaf}/${line.page}/${line.line}`} line={line} {...common} />;
  } else {
    throw new MushafError(
      'BAD_LINE_PROP',
      `<MushafLine> expects either line={MushafLineData} (from getMushafLine()) or mushaf + page + line={number}; got line of type ${describeValue(props.line)}.`,
    );
  }
  // layout="none" adds no wrapper element (so `style` stays on our root) and never premounts.
  return name === undefined ? body : <Sequence layout="none" name={name}>{body}</Sequence>;
};
