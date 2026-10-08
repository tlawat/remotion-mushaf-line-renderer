// Reading the printed lines the package mounted, through its DOM contract: `.mushaf-line` roots
// (`data-page`, `data-line`, `data-sliced`), their `.mushaf-line__row` (hidden until the page font is
// in and the line fitted) and the `span.mushaf-word`s in it (`data-location`, `data-kind`,
// `data-hidden`).
import type {WordBox} from './layout';

/** The class of a printed line's row, as the package names it. */
export const ROW_SELECTOR = '.mushaf-line__row';

/** A row is ready to measure once the package shows it: `visibility: visible`, set when its font is in and it is fitted. */
export const isRowVisible = (row: HTMLElement): boolean => row.style.visibility === 'visible';

/**
 * A name for a row that holds across frames: the page, the line and the slice of its line (a split
 * line is mounted twice, once per band). Rows with the same name get a running number.
 */
export const rowNameOf = (row: HTMLElement): string => {
  const root = row.closest<HTMLElement>('.mushaf-line');
  return `p${root?.dataset.page ?? '?'}l${root?.dataset.line ?? '?'}s${root?.dataset.sliced ?? 'all'}`;
};

/**
 * The word boxes of a visible row and its width, in the row's own px: the client rects are divided
 * by the row's on-screen scale (its rect over its `offsetWidth`), so a preview that scales the
 * canvas (the Studio's) gives the same numbers as a render. Positions are from the row's left edge;
 * a transform that moves the line (a scroll, an entrance) moves the words with it and cancels out.
 */
export const measureRow = (row: HTMLElement): {readonly boxes: readonly WordBox[]; readonly width: number} => {
  const rowRect = row.getBoundingClientRect();
  const scale = row.offsetWidth > 0 && rowRect.width > 0 ? rowRect.width / row.offsetWidth : 1;
  const boxes: WordBox[] = [];
  for (const child of Array.from(row.children)) {
    if (!(child instanceof HTMLElement) || !child.classList.contains('mushaf-word')) continue;
    const rect = child.getBoundingClientRect();
    boxes.push({
      id: child.dataset.location ?? '',
      kind: child.dataset.kind === 'end' ? 'end' : 'word',
      hidden: child.dataset.hidden === 'true',
      left: (rect.left - rowRect.left) / scale,
      width: rect.width / scale,
    });
  }
  return {boxes, width: rowRect.width / scale};
};
