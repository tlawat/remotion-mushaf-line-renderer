import type * as React from 'react';
import type {ChapterInfo} from './chapter-info';
import {clampStyle} from './TafsirCard';

/** "1st", "2nd", "3rd", "11th", "112th". */
export const ordinal = (n: number): string => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
};

/** "Meccan · revealed 5th · 7 ayahs": the facts line of a chapter card. */
export const chapterFactsText = (info: ChapterInfo): string =>
  [
    info.revelationPlace === 'makkah' ? 'Meccan' : 'Medinan',
    `revealed ${ordinal(info.revelationOrder)}`,
    `${info.ayahCount} ${info.ayahCount === 1 ? 'ayah' : 'ayahs'}`,
  ].join(' · ');

export type ChapterInfoCardProps = {
  readonly info: ChapterInfo;
  readonly fontFamily: string;
  /** The Arabic name's family (default `fontFamily`). */
  readonly arabicFontFamily?: string | undefined;
  /** px, of the short text; the names are 1.4 of it, the facts line 0.8. */
  readonly fontSize: number;
  readonly color: string;
  readonly background?: string | undefined;
  /** The facts line's colour (default `color`). */
  readonly accentColor?: string | undefined;
  /** The short text is cut to this many lines, with an ellipsis (default 4); 0 leaves it out. */
  readonly maxLines?: number | undefined;
  readonly style?: React.CSSProperties | undefined;
  readonly className?: string | undefined;
};

/**
 * A card about a surah: its name in English and Arabic and its translated name, where and in which
 * order it was revealed and its ayah count ("Meccan · revealed 5th · 7 ayahs", from `/chapters/{id}`),
 * and quran.com's short introduction cut to `maxLines`. Plain text only. Pure in its props.
 */
export const ChapterInfoCard: React.FC<ChapterInfoCardProps> = ({
  info,
  fontFamily,
  arabicFontFamily,
  fontSize,
  color,
  background,
  accentColor,
  maxLines,
  style,
  className,
}) => {
  const lines = maxLines ?? 4;
  return (
    <div
      className={className ? `mushaf-chapter-card ${className}` : 'mushaf-chapter-card'}
      data-surah={info.surah}
      style={{
        fontFamily,
        color,
        background,
        padding: background ? fontSize : 0,
        borderRadius: background ? fontSize * 0.5 : 0,
        textAlign: 'center',
        ...style,
      }}
    >
      <div
        data-mushaf-card-part="names"
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'baseline',
          gap: fontSize * 0.8,
          fontSize: fontSize * 1.4,
        }}
      >
        <span data-mushaf-card-part="english" style={{fontWeight: 700}}>
          {info.nameSimple}
        </span>
        <span
          data-mushaf-card-part="arabic"
          dir="rtl"
          lang="ar"
          style={{fontFamily: arabicFontFamily ?? fontFamily, unicodeBidi: 'isolate'}}
        >
          {info.nameArabic}
        </span>
      </div>
      <div data-mushaf-card-part="translated" style={{fontSize, fontStyle: 'italic'}}>
        {info.translatedName}
      </div>
      <div
        data-mushaf-card-part="facts"
        style={{fontSize: fontSize * 0.8, color: accentColor ?? color, margin: `${fontSize * 0.4}px 0`}}
      >
        {chapterFactsText(info)}
      </div>
      {lines > 0 && info.shortText ? (
        <div data-mushaf-card-part="text" style={{fontSize, textAlign: 'start', ...clampStyle(lines, fontSize)}}>
          {info.shortText}
        </div>
      ) : null}
    </div>
  );
};
