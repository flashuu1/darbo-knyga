/**
 * Make the page behave like a native app rather than a scrollable web page.
 *
 * CSS does most of it (styles.css: html/body `position: fixed; inset: 0; overflow: hidden;
 * overscroll-behavior: none; touch-action: pan-x pan-y`, and inner scrollers with
 * `overscroll-behavior: contain`). This adds what CSS cannot:
 * - Safari's proprietary pinch events (gesturestart/change/end) are cancelled, so the app never zooms
 *   even where iOS ignores `user-scalable=no` in the viewport meta tag;
 * - if iOS still scrolls the window (it may do so to reveal a focused field), it is put back at 0,0, so
 *   the whole app never slides under the status bar.
 * There is deliberately no document-level non-passive touchmove listener: it would make every scroll
 * wait for JavaScript, and `touch-action: pan-x pan-y` already rules out pinch-zoom for touch input.
 */
export function lockDocument(win: Window = window): () => void {
  const doc = win.document;
  const cancel = (e: Event) => { if (e.cancelable) e.preventDefault(); };
  const unscroll = () => { if (win.scrollX !== 0 || win.scrollY !== 0) win.scrollTo(0, 0); };
  const opts = { passive: false } as const;
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) doc.addEventListener(t, cancel, opts);
  win.addEventListener('scroll', unscroll, { passive: true });
  return () => {
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) doc.removeEventListener(t, cancel);
    win.removeEventListener('scroll', unscroll);
  };
}
