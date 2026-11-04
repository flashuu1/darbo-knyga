/**
 * Rules shared by every gesture that takes a whole page sideways (swipe back, the pages of Išlaidos, the days of the calendar).
 * They exist so that a new row that scrolls sideways, or a new page, cannot fight a page gesture: the rule is general, not a
 * list of names. `tests/e2e/gesture-audit.spec.ts` checks it for every page, on every element that scrolls sideways.
 */

/**
 * True when `target` is inside something that scrolls sideways and has something to scroll (a row of chips, of payers...). A
 * drag that starts there belongs to that element, never to the page: the browser scrolls it, and the page must stay put.
 */
export function inSideScroller(target: EventTarget | null, boundary: Element): boolean {
  for (let e = target instanceof Element ? target : null; e; e = e.parentElement) {
    const x = getComputedStyle(e).overflowX;
    if ((x === 'auto' || x === 'scroll') && e.scrollWidth > e.clientWidth + 1) return true;
    if (e === boundary) break;
  }
  return false;
}

/** Swipe back starts only in the left part of the page (like the edge of iOS, but wide enough for a thumb): this many px from its left edge. */
export const edgeZone = (width: number) => Math.max(80, Math.round(width * 0.28));
