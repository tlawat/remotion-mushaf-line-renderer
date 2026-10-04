import type * as React from 'react';
import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {useDelayRender} from 'remotion';
import type {WordGloss} from '../types';
import {fitLabelSize, interlinearRowHeight, type LabelPlacement, placeLabels} from './layout';
import {isRowVisible, measureRow, ROW_SELECTOR, rowNameOf} from './measure';

export type InterlinearGlossesProps = {
  /** The word-by-word translation; `null` leaves its label row out. */
  readonly gloss: WordGloss | null;
  /** The word-by-word transliteration, a second label row; `null` leaves it out. */
  readonly transliteration: WordGloss | null;
  /** The word being recited (`MushafWord.id`): its label alone takes `activeColor`. `null` for none. */
  readonly activeWordId: string | null;
  readonly activeColor?: string | undefined;
  readonly fontFamily: string;
  /** px: `interlinearFontSize()`. */
  readonly fontSize: number;
  readonly color: string;
  /** px from the top of each line's row to the first label row: `interlinearTop()`. */
  readonly top: number;
  /** The printed lines (`<MushafLine>`s in Sequences, or a `<MushafLineWindow>`), rendered as they are. */
  readonly children: React.ReactNode;
};

/** One measured row of a printed line and the labels it gets. */
type MeasuredRow = {
  readonly name: string;
  readonly row: HTMLElement;
  readonly placements: readonly LabelPlacement[];
};

const sameRows = (a: readonly MeasuredRow[], b: readonly MeasuredRow[]): boolean =>
  a.length === b.length &&
  a.every(
    (row, i) =>
      row.name === b[i]!.name &&
      row.row === b[i]!.row &&
      JSON.stringify(row.placements) === JSON.stringify(b[i]!.placements),
  );

/** The labels' layer in a row: no size of its own, so the package's fit (the sum of the row's children) never counts it. */
const LAYER_STYLE: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  width: 0,
  height: 0,
  margin: 0,
  padding: 0,
  overflow: 'visible',
  direction: 'ltr',
  pointerEvents: 'none',
  fontWeight: 400,
  fontStyle: 'normal',
  fontPalette: 'normal',
  letterSpacing: 'normal',
  wordSpacing: 'normal',
};

const LABEL = 'Mushaf Studio: measuring the printed words for the interlinear glosses';

/** The attribute a label's text carries: what its fitted size is stored under. */
const FIT_KEY = 'data-interlinear-fit';

/**
 * Glosses under the printed words: each shown word of every mounted line gets its gloss (and its
 * transliteration in a second row) centred under it, never wider than the word and half the gap to
 * each neighbour (shrunk to fit, then cut with an ellipsis). Wraps the lines' rendering.
 *
 * The package hides a line's row until its page font is in and the line is fitted; this measures
 * the `.mushaf-word`s of each row once it is visible (a layout effect on every render, and a
 * `MutationObserver` for a row that becomes visible or changes while this component does not
 * re-render) and portals the labels into the row itself, so they move with whatever moves the line:
 * the window's scroll, an entrance, a slot. Words a slice hides, the ayah-end markers and words
 * without a gloss get no label. A `delayRender()` handle is held from the first render until every
 * mounted row is measured and every label fitted, so no frame is captured without them; a row that
 * is not laid out (zero width) is skipped, not waited for. Deterministic: positions come from the
 * layout alone.
 */
export const InterlinearGlosses: React.FC<InterlinearGlossesProps> = ({
  gloss,
  transliteration,
  activeWordId,
  activeColor,
  fontFamily,
  fontSize,
  color,
  top,
  children,
}) => {
  const {delayRender, continueRender} = useDelayRender();
  const containerRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<readonly MeasuredRow[]>([]);
  const [fits, setFits] = useState<Readonly<Record<string, number>>>({});
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const fitsRef = useRef(fits);
  fitsRef.current = fits;
  // Held from the first render (so it is registered before Remotion releases its frame handle) and
  // released once settled; taken again whenever a row or a label is left to measure.
  const handle = useRef<number | null>(null);
  const started = useRef(false);
  if (!started.current) {
    started.current = true;
    handle.current = delayRender(LABEL);
  }

  const sync = (): void => {
    const container = containerRef.current;
    if (!container) return;
    let waiting = false;
    const next: MeasuredRow[] = [];
    const counts = new Map<string, number>();
    for (const row of Array.from(container.querySelectorAll<HTMLElement>(ROW_SELECTOR))) {
      if (!isRowVisible(row)) {
        waiting = true;
        continue;
      }
      const {boxes, width} = measureRow(row);
      if (width <= 0) continue; // not laid out (a premounted line under `display: none`): nothing to place yet
      const base = rowNameOf(row);
      const n = counts.get(base) ?? 0;
      counts.set(base, n + 1);
      next.push({name: `${base}#${n}`, row, placements: placeLabels(boxes, width)});
    }
    const changed = !sameRows(rowsRef.current, next);
    if (changed) setRows(next);
    // Labels rendered at the base size and not fitted yet: their natural width decides their size.
    const fitted: Record<string, number> = {};
    let unfitted = false;
    for (const text of Array.from(container.querySelectorAll<HTMLElement>(`[${FIT_KEY}]`))) {
      const key = text.getAttribute(FIT_KEY)!;
      if (fitsRef.current[key] !== undefined) continue;
      unfitted = true;
      fitted[key] = fitLabelSize(text.scrollWidth, Number(text.dataset.width), fontSize);
    }
    if (unfitted) setFits((current) => ({...current, ...fitted}));
    const settled = !waiting && !changed && !unfitted;
    if (settled && handle.current !== null) {
      continueRender(handle.current);
      handle.current = null;
    } else if (!settled && handle.current === null) {
      handle.current = delayRender(LABEL);
    }
  };
  const syncRef = useRef(sync);
  syncRef.current = sync;

  // Every render: the lines change with the frame (a slot mounts, a slice moves).
  useLayoutEffect(() => syncRef.current());

  // A row that becomes visible, or is re-fitted, while this component does not re-render.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        const target = mutation.target as Element;
        if (target.closest?.('[data-mushaf-interlinear]')) return false;
        return mutation.type === 'childList' || target.matches?.(ROW_SELECTOR);
      });
      if (relevant) syncRef.current();
    });
    observer.observe(container, {subtree: true, childList: true, attributes: true, attributeFilter: ['style']});
    return () => observer.disconnect();
  }, []);

  // On unmount only: `continueRender` is read through a ref, so a new function identity never releases a held handle.
  const release = useRef(continueRender);
  release.current = continueRender;
  useEffect(
    () => () => {
      if (handle.current !== null) {
        release.current(handle.current);
        handle.current = null;
      }
    },
    [],
  );

  const rowHeight = interlinearRowHeight(fontSize);
  const texts = (id: string): readonly string[] => [
    ...(gloss ? [gloss.words[id] ?? ''] : []),
    ...(transliteration ? [transliteration.words[id] ?? ''] : []),
  ];
  const layer = (measured: MeasuredRow) => (
    <div
      data-mushaf-interlinear={measured.name}
      style={{...LAYER_STYLE, top, fontFamily, color, lineHeight: `${rowHeight}px`}}
    >
      {measured.placements.map((placement) => {
        const lines = texts(placement.id);
        if (lines.every((line) => line === '')) return null;
        const active = activeColor !== undefined && placement.id === activeWordId;
        return (
          <div
            key={placement.id}
            data-interlinear-label={placement.id}
            data-active={active ? 'true' : undefined}
            style={{
              position: 'absolute',
              top: 0,
              left: placement.left,
              width: placement.width,
              textAlign: 'center',
              ...(active ? {color: activeColor} : {}),
            }}
          >
            {lines.map((line, row) => {
              const key = `${measured.name}/${placement.id}/${row}/${placement.width}/${fontSize}/${line}`;
              const size = fits[key] ?? fontSize;
              return (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: the rows are the gloss and the transliteration, in that order.
                  key={row}
                  {...{[FIT_KEY]: key}}
                  data-width={placement.width}
                  style={{
                    height: rowHeight,
                    fontSize: size,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    unicodeBidi: 'plaintext',
                  }}
                >
                  {line}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  return (
    <div ref={containerRef} data-mushaf-interlinear-root="" style={{display: 'contents'}}>
      {children}
      {rows.map((measured) => createPortal(layer(measured), measured.row, measured.name))}
    </div>
  );
};
