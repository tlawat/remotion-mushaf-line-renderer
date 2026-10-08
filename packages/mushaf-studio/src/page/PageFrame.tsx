import type * as React from 'react';
import type {PageGeometry} from './geometry';
import type {PageView} from './schema';

export type PageFrameProps = {
  readonly frame: Exclude<PageView['frame'], 'none'>;
  readonly geometry: PageGeometry;
  /** The page colour: the corner ornaments are filled with it so the rules do not show through. */
  readonly background: string;
};

/** A corner ornament centred on `(x, y)`: a lozenge on the rules with a dot in it, as the printed border has. */
const Corner: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly stroke: number;
  readonly background: string;
}> = ({x, y, r, stroke, background}) => (
  <g data-corner="">
    <path
      d={`M ${x - r} ${y} L ${x} ${y - r} L ${x + r} ${y} L ${x} ${y + r} Z`}
      fill={background}
      stroke="currentColor"
      strokeWidth={stroke}
    />
    <circle cx={x} cy={y} r={r * 0.35} fill="currentColor" />
  </g>
);

/**
 * The page's border, drawn in SVG over the band `pageGeometry()` keeps around the text: a thick
 * outer rule and a thin inner one (`simple`), with a lozenge at each corner (`ornate`). Painted in
 * `currentColor`, the layout's ink, so it follows the page's colours.
 */
export const PageFrame: React.FC<PageFrameProps> = ({frame, geometry, background}) => {
  const {band, fontSize, width} = geometry;
  const height = geometry.height - geometry.footer;
  const outer = Math.max(1, Math.round(0.08 * fontSize));
  const inner = Math.max(1, Math.round(0.04 * fontSize));
  const o = band * 0.25;
  const i = band * 0.75;
  const mid = band * 0.5;
  const r = band * 0.8;
  return (
    <svg
      data-page-frame={frame}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none'}}
      aria-hidden="true"
    >
      <rect
        x={o}
        y={o}
        width={width - 2 * o}
        height={height - 2 * o}
        fill="none"
        stroke="currentColor"
        strokeWidth={outer}
      />
      <rect
        x={i}
        y={i}
        width={width - 2 * i}
        height={height - 2 * i}
        fill="none"
        stroke="currentColor"
        strokeWidth={inner}
      />
      {frame === 'ornate' &&
        [
          [mid, mid],
          [width - mid, mid],
          [mid, height - mid],
          [width - mid, height - mid],
        ].map(([x, y]) => <Corner key={`${x},${y}`} x={x!} y={y!} r={r} stroke={inner} background={background} />)}
    </svg>
  );
};
