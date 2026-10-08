import type {MushafThemeSelection} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {tajweedLegend} from './tajweed';

export type TajweedLegendProps = {
  /** The lines' theme (`themeSelectionFrom()` of the composition's props): the swatches take its colours. */
  readonly theme: MushafThemeSelection;
  /** Swatches side by side, wrapping (`'row'`, the default), or one under the other. */
  readonly orientation?: 'row' | 'column' | undefined;
  /** Which names to write next to a swatch (default both, English first). */
  readonly names?: 'both' | 'english' | 'arabic' | undefined;
  /**
   * Name each swatch by its rule (the default) or by its colour in the font's default palette
   * ("Dark red"), for a legend that makes no claim about the rules.
   */
  readonly label?: 'rule' | 'colour' | undefined;
  /** Also the grey of the silent letters (default `false`). */
  readonly silent?: boolean | undefined;
  readonly fontFamily: string;
  /** The Arabic names' family (default `fontFamily`). */
  readonly arabicFontFamily?: string | undefined;
  /** px. */
  readonly fontSize: number;
  /** The names' colour, and the swatches' for a theme that paints a rule in `currentColor`. */
  readonly color: string;
  /** px (default `fontSize`). */
  readonly swatchSize?: number | undefined;
  readonly style?: React.CSSProperties | undefined;
  readonly className?: string | undefined;
};

/**
 * The legend of the tajweed colours for a theme: one swatch per rule in the colour the theme paints
 * it (`tajweedLegend()`), named in English and/or Arabic, in a wrapping row or a column. A theme
 * without tajweed colours paints every swatch alike; `themeHasTajweedColors()` tells when to leave
 * the legend out. Pure in its props.
 */
export const TajweedLegend: React.FC<TajweedLegendProps> = ({
  theme,
  orientation,
  names,
  label,
  silent,
  fontFamily,
  arabicFontFamily,
  fontSize,
  color,
  swatchSize,
  style,
  className,
}) => {
  const items = tajweedLegend(theme, {silent});
  const show = names ?? 'both';
  const size = swatchSize ?? fontSize;
  const column = orientation === 'column';
  return (
    <div
      className={className ? `mushaf-tajweed-legend ${className}` : 'mushaf-tajweed-legend'}
      data-orientation={column ? 'column' : 'row'}
      style={{
        display: 'flex',
        flexDirection: column ? 'column' : 'row',
        flexWrap: column ? 'nowrap' : 'wrap',
        gap: `${fontSize * 0.5}px ${fontSize * 1.2}px`,
        fontFamily,
        fontSize,
        color,
        lineHeight: 1.3,
        ...style,
      }}
    >
      {items.map((item) => {
        const english = label === 'colour' ? item.colorName.english : item.english;
        const arabic = label === 'colour' ? item.colorName.arabic : item.arabic;
        return (
          <div
            key={item.id}
            data-rule={item.id}
            data-entry={item.entry}
            style={{display: 'flex', alignItems: 'center', gap: fontSize * 0.4}}
          >
            <span
              data-mushaf-legend-part="swatch"
              style={{
                flex: 'none',
                width: size,
                height: size,
                borderRadius: size * 0.25,
                background: item.color === 'currentColor' ? color : item.color,
              }}
            />
            {show === 'arabic' ? null : <span data-mushaf-legend-part="english">{english}</span>}
            {show === 'english' ? null : (
              <span
                data-mushaf-legend-part="arabic"
                dir="rtl"
                lang="ar"
                style={{fontFamily: arabicFontFamily ?? fontFamily, unicodeBidi: 'isolate'}}
              >
                {arabic}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
