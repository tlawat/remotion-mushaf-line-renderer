import type * as React from 'react';
import type {PageGeometry} from './geometry';
import type {PageView} from './schema';

export type PageFrameProps = {
  readonly frame: Exclude<PageView['frame'], 'none'>;
  readonly geometry: PageGeometry;
};

/**
 * The page's border, drawn in SVG over the band `pageGeometry()` keeps around the text: a thick
 * outer rule and a thin inner one (`simple`), square corners and no ornaments. Painted in
 * `currentColor`, the layout's ink, so it follows the page's colours.
 */
export const PageFrame: React.FC<PageFrameProps> = ({frame, geometry}) => {
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
    </svg>
  );
};
