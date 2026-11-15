import type * as React from 'react';
import type {PageGeometry} from './geometry';
import type {PageView} from './schema';

export type PageFrameProps = {
  readonly frame: Exclude<PageView['frame'], 'none'>;
  readonly geometry: PageGeometry;
  /** The rules' colour: the video's metal (`metalOf()`), the rosettes' gold. */
  readonly color: string;
};

/**
 * The page's border, drawn in SVG over the band `pageGeometry()` keeps around the text: a thick
 * outer rule (0.08 em) and a thin inner one (0.04 em) (`simple`), square corners and no ornaments,
 * in the metal, so the border is gold line work as the rosettes are.
 */
export const PageFrame: React.FC<PageFrameProps> = ({frame, geometry, color}) => {
  const {band, fontSize, width} = geometry;
  const height = geometry.height - geometry.footer;
  const outer = Math.max(1, Math.round(0.08 * fontSize));
  const inner = Math.max(1, Math.round(0.04 * fontSize));
  const o = band * 0.25;
  const i = band * 0.75;
  return (
    <svg
      data-page-frame={frame}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none'}}
      aria-hidden="true"
    >
      <rect x={o} y={o} width={width - 2 * o} height={height - 2 * o} fill="none" stroke={color} strokeWidth={outer} />
      <rect x={i} y={i} width={width - 2 * i} height={height - 2 * i} fill="none" stroke={color} strokeWidth={inner} />
    </svg>
  );
};
