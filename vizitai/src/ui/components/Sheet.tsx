import type { ComponentChildren } from 'preact';

export function Sheet({ title, left, right, onClose, children, testId = 'sheet' }: {
  title: string; left?: ComponentChildren; right?: ComponentChildren; onClose: () => void; children: ComponentChildren; testId?: string;
}) {
  return (
    <div class="sheet-root">
      <div class="backdrop" onClick={onClose} />
      <div class="sheet" role="dialog" aria-label={title} data-testid={testId}>
        <div class="grabber" />
        <header class="sheet-nav">
          <div class="side l">{left}</div>
          <h2>{title}</h2>
          <div class="side r">{right}</div>
        </header>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}
