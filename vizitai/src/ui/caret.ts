/**
 * The cursor of an amount field (a number pad field) is always at the END of what is in it (a selection is left alone): a tap into the middle or at the
 * start of "450" would put it where Backspace cannot reach the digits she just typed wrong. One rule for every amount field in
 * the app (Suma, the amount of a new expense, the fixed amount in Nustatymai, and any added later): everything with
 * `inputmode="decimal"`. Called once at start.
 */
export function keepAmountCaretAtEnd() {
  const isAmount = (e: Element | null): e is HTMLInputElement => e instanceof HTMLInputElement && e.inputMode === 'decimal';
  const toEnd = () => {
    const el = document.activeElement;
    if (!isAmount(el)) return;
    const end = el.value.length;
    // only a plain cursor is moved; text she has selected on purpose (or the whole number selected by the app) stays selected
    if (el.selectionStart === el.selectionEnd && el.selectionStart !== end) { try { el.setSelectionRange(end, end); } catch { /* a type that has no selection */ } }
  };
  // iOS puts the cursor where the finger was a moment AFTER the tap: so after the tap, after focus and whenever the selection moves
  document.addEventListener('selectionchange', toEnd);
  for (const type of ['focusin', 'pointerup', 'touchend', 'click']) document.addEventListener(type, () => { requestAnimationFrame(toEnd); window.setTimeout(toEnd, 60); }, true);
}
