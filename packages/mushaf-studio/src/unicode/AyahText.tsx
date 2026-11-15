import {bandBoxes, type InkBand, measureInkOverhang} from '@tlawat/remotion-mushaf-line';
import * as React from 'react';
import type {AyahWord} from './text';

export type AyahTextProps = {
  /** One ayah's words in reading order, the marker last: `ayahWordsOf()`. */
  readonly words: readonly AyahWord[];
  /** The word being recited (`"surah:ayah:position"`), painted with `highlightStyle`; `null` for none. */
  readonly activeWordId?: string | null | undefined;
  readonly highlightStyle?: React.CSSProperties | undefined;
  /** A style per word (dimming, a whole-ayah highlight); the active word's `highlightStyle` goes over it. */
  readonly wordStyle?: ((word: AyahWord) => React.CSSProperties | undefined) | undefined;
  /**
   * A cue shown over a word in place of its text: the first-letter cue of the memorisation mode. The
   * word's own text stays under it, hidden, so the word keeps its width and the lines break where
   * the full text's do. `undefined`, or no function, shows the word's text.
   */
  readonly wordText?: ((word: AyahWord) => string | undefined) | undefined;
  readonly fontFamily: string;
  /** px. */
  readonly fontSize: number;
  /** A multiple of `fontSize`: Uthmani marks above and below need 1.8 or more. */
  readonly lineHeight: number;
  readonly color?: string | undefined;
  /**
   * The wash behind a word, as its colour with the band's strength as alpha (`washColor()`), or
   * `undefined` for none. Drawn from where each word's ink is, one shape per colour on each line of
   * the block, behind the text: an overhanging hamza-wasl alif stays inside its word's band, and two
   * bands that meet show the stronger, never their sum. Same purity rule as `wordStyle`.
   */
  readonly wordBand?: ((word: AyahWord) => string | undefined) | undefined;
  /** `false` while the face is not in `document.fonts`: the bands are measured again once it is. Default `true`. */
  readonly fontReady?: boolean | undefined;
  /** px; the text wraps inside it, balanced so no word is left alone on the last line, and is centred. */
  readonly maxWidth?: number | undefined;
  readonly style?: React.CSSProperties | undefined;
  readonly className?: string | undefined;
};

/** The class of the span holding an ayah's last word and its end marker, which never wraps between them. */
export const AYAH_TAIL_CLASS = 'mushaf-ayah-tail';

/** The space between two words: 0.1 em, as the Uthmani text is set in print. */
export const AYAH_WORD_SPACING = '0.1em';

/** Each word is a box as tall as its line, so the wash behind it (`wordBand`) has the line box to sit in. */
const WORD_BOX: React.CSSProperties = {display: 'inline-block'};

/** The band's shape on a 1.9 em line box (render-design.md 5.12): 1.35 em tall at 55 %. */
const AYAH_BAND_SHAPE = {height: 1.35, y: 0.55} as const;

/** Where a word's ink is in the block, px, at the block's own scale: its line's top and its ink's sides. */
type WordInk = {readonly id: string; readonly top: number; readonly left: number; readonly right: number};

/**
 * Where each word's ink is (`null` until measured, or without `enabled`): once per `key`, in a layout
 * effect before the block is painted. A word's box from the DOM, divided by the block's own scale (a
 * preview zoom does not count), widened by how far its glyphs overhang their advance on a canvas
 * (`measureInkOverhang()`): the hamza-wasl alif of Uthmanic Hafs reaches well past its word's box.
 */
const useWordInk = (
  enabled: boolean,
  key: string,
  font: string,
  words: readonly AyahWord[],
  blockRef: React.RefObject<HTMLDivElement | null>,
): readonly WordInk[] | null => {
  const [measured, setMeasured] = React.useState<{key: string; ink: readonly WordInk[]} | null>(null);
  React.useLayoutEffect(() => {
    if (!enabled || measured?.key === key) return;
    const block = blockRef.current;
    if (!block) return;
    const blockBox = block.getBoundingClientRect();
    const scale = block.offsetWidth > 0 && blockBox.width > 0 ? blockBox.width / block.offsetWidth : 1;
    const texts = new Map(words.map((word) => [word.id, word.text]));
    const ink = Array.from(block.querySelectorAll<HTMLElement>('.mushaf-uword')).map((span): WordInk => {
      const id = span.dataset.location ?? '';
      const box = span.getBoundingClientRect();
      const overhang = measureInkOverhang(texts.get(id) ?? span.textContent ?? '', font);
      const left = (box.left - blockBox.left) / scale;
      const right = (box.right - blockBox.left) / scale;
      return {
        id,
        top: Math.round((box.top - blockBox.top) / scale),
        left: overhang === null ? left : left - overhang.left,
        right: overhang === null ? right : right + overhang.right,
      };
    });
    setMeasured({key, ink});
  }, [enabled, key, font, words, measured, blockRef]);
  return enabled && measured?.key === key ? measured.ink : null;
};

const classOf = (word: AyahWord, active: boolean): string =>
  `mushaf-uword mushaf-uword--${word.kind}${active ? ' mushaf-uword--active' : ''}`;

// A cue over the word it stands for. The word is laid out, hidden, in an inline block as tall as a
// line, and the cue is a block of the same line height at its top right (where a right-to-left word
// starts): the same width, the same baseline, so nothing on the line moves.
const cueOver = (text: string, cue: string): React.ReactNode => (
  <span data-mushaf-cue-box="" style={{display: 'inline-block', position: 'relative'}}>
    <span data-mushaf-cue-word="" style={{visibility: 'hidden'}}>
      {text}
    </span>
    <span data-mushaf-cue="" style={{position: 'absolute', top: 0, right: 0, whiteSpace: 'nowrap'}}>
      {cue}
    </span>
  </span>
);

/**
 * One ayah as Unicode text, right to left and centred, a `<span class="mushaf-uword">` per word
 * (`data-location` its id) with a space between, the ayah-end marker as its Arabic-Indic digits
 * (`١`) in a span of its own: QUL's Uthmani Hafs font draws the rosette around them itself, and a
 * U+06DD in front would add a second, empty one. The last word and the marker sit together in a
 * `white-space: nowrap` span (`mushaf-ayah-tail`), so the marker never starts a line on its own.
 * Each word is an inline block as tall as its line (a wash fills its line box), the words 0.1 em
 * apart, the lines balanced (`text-wrap: balance`) so none ends on a lone word.
 * The active word gets `highlightStyle` and `mushaf-uword--active`. Font features are left to the
 * font. Pure in its props, so frames are deterministic.
 */
export const AyahText: React.FC<AyahTextProps> = ({
  words,
  activeWordId,
  highlightStyle,
  wordStyle,
  wordText,
  fontFamily,
  fontSize,
  lineHeight,
  color,
  wordBand,
  fontReady = true,
  maxWidth,
  style,
  className,
}) => {
  const blockRef = React.useRef<HTMLDivElement>(null);
  const font = `${fontSize}px ${fontFamily}`;
  const ink = useWordInk(
    wordBand !== undefined,
    `${words.map((word) => word.id).join(',')}/${font}/${lineHeight}/${maxWidth ?? ''}/${fontReady}`,
    font,
    words,
    blockRef,
  );
  const wordSpan = (word: AyahWord): React.ReactNode => {
    const active = activeWordId === word.id;
    const own = wordStyle?.(word);
    const merged = active && highlightStyle ? {...own, ...highlightStyle} : own;
    const cue = wordText?.(word);
    return (
      <span className={classOf(word, active)} data-location={word.id} style={{...WORD_BOX, ...merged}}>
        {cue === undefined || cue === word.text ? word.text : cueOver(word.text, cue)}
      </span>
    );
  };
  // The bands: one layer per line of the block, behind its text (the block isolates them under it).
  const lineBox = Math.round(fontSize * lineHeight * 100) / 100;
  const bandLines = new Map<number, InkBand[]>();
  if (wordBand !== undefined && ink !== null) {
    const byId = new Map(words.map((word) => [word.id, word]));
    for (const entry of ink) {
      const word = byId.get(entry.id);
      const color = word === undefined ? undefined : wordBand(word);
      if (color === undefined) continue;
      const bands = bandLines.get(entry.top) ?? [];
      bands.push({left: entry.left, right: entry.right, color});
      bandLines.set(entry.top, bands);
    }
  }
  const bandLayers = [...bandLines.entries()].map(([top, bands]) => (
    <div
      key={top}
      aria-hidden="true"
      style={{position: 'absolute', left: 0, right: 0, top, height: lineBox, zIndex: -1}}
    >
      {bandBoxes(bands, {fontSize, lineHeight: lineBox, shape: AYAH_BAND_SHAPE}).map((box) => (
        <div key={box.key} data-mushaf-word-band="" style={box.style} />
      ))}
    </div>
  ));
  const marker = words[words.length - 1];
  const tail = marker?.kind === 'end' && words.length > 1 ? words.slice(-2) : [];
  const lead = words.slice(0, words.length - tail.length);
  return (
    <div
      ref={blockRef}
      dir="rtl"
      lang="ar"
      className={className ? `mushaf-ayah-text ${className}` : 'mushaf-ayah-text'}
      style={{
        fontFamily,
        fontSize,
        lineHeight,
        color,
        maxWidth,
        marginInline: 'auto',
        textAlign: 'center',
        textWrap: 'balance',
        wordSpacing: AYAH_WORD_SPACING,
        // The bands sit under the text: a stacking context of its own keeps them above whatever is behind the block.
        position: 'relative',
        isolation: 'isolate',
        ...style,
      }}
    >
      {bandLayers}
      {lead.map((word, i) => (
        <React.Fragment key={word.id}>
          {i > 0 ? ' ' : null}
          {wordSpan(word)}
        </React.Fragment>
      ))}
      {tail.length > 0 ? (
        <>
          {lead.length > 0 ? ' ' : null}
          {/* The space inside does not break: the marker stays at the end of its last word's line. */}
          <span className={AYAH_TAIL_CLASS} style={{whiteSpace: 'nowrap'}}>
            {wordSpan(tail[0]!)} {wordSpan(tail[1]!)}
          </span>
        </>
      ) : null}
    </div>
  );
};
