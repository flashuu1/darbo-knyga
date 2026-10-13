import { useEffect, useState } from 'preact/hooks';

/**
 * Height in px of what covers the bottom of the layout viewport (the iOS keyboard), 0 when nothing does.
 * iOS shrinks the visual viewport for the keyboard but leaves the layout viewport alone.
 */
export function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const read = () => setH(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    read();
    vv.addEventListener('resize', read);
    vv.addEventListener('scroll', read);
    return () => { vv.removeEventListener('resize', read); vv.removeEventListener('scroll', read); };
  }, []);
  return h;
}
