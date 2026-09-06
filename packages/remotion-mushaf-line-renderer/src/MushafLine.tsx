import * as React from 'react';
import {Sequence} from 'remotion';
import {MushafError, describeValue} from './errors';
import {LineRenderer} from './internal/LineRenderer';
import {ResolveLine} from './internal/ResolveLine';
import {resolveMushafId} from './mushafs';
import type {MushafId, MushafLineProps} from './types';
import {assertLineData} from './validate-line-data';

/**
 * Renders one line of the mushaf, pixel-faithful to the printed page.
 *
 * - Timing comes from the enclosing `<Sequence from>`: the entrance runs over the local frame.
 * - Pass `line` (from `getMushafLine()`, ideally resolved in `calculateMetadata()`), or
 *   `page` + `line` (+ optional `mushaf` / `tajweed`) to resolve at render time behind
 *   `delayRender()`. Glyphs are plain black by default and follow the inherited CSS `color`;
 *   `tajweed` switches to QUL's colour font.
 * - The root is a normal-flow block of height `lineHeight` (default 2.2 × fontSize); stack fifteen
 *   of them for a page, or position one with `style` / the enclosing `<Sequence style>`.
 * - Nothing is painted until the page font is loaded (a fallback font would show wrong words).
 */
export const MushafLine: React.FC<MushafLineProps> = (props) => {
  const {name, style, className, enter, exit, fontSize, lineHeight, activeWordId, activeWordStyle, wordStyle, wordClassName} = props;
  const common = {style, className, enter, exit, fontSize, lineHeight, activeWordId, activeWordStyle, wordStyle, wordClassName};
  let body: React.ReactElement;
  if (typeof props.line === 'number') {
    const {mushaf, tajweed, page, line} = props as {mushaf?: MushafId; tajweed?: boolean; page: number; line: number};
    body = <ResolveLine mushaf={resolveMushafId(mushaf, tajweed)} page={page} line={line} {...common} />;
  } else if (props.line !== null && typeof props.line === 'object') {
    if ((props as {tajweed?: unknown}).tajweed !== undefined) {
      throw new MushafError(
        'BAD_LINE_PROP',
        'Resolved line data already carries its font set, so `tajweed` cannot be set alongside `line={MushafLineData}`. Pass `tajweed` to getMushafLine()/getMushafLines() where the data is resolved.',
        {tajweed: (props as {tajweed?: unknown}).tajweed},
      );
    }
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
