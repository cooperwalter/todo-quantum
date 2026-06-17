import { useEffect } from 'react';

// Track whether the user is currently driving with the mouse or the keyboard and
// expose it as `data-pointer` on <html>. Hover affordances key off mouse mode so
// they don't linger after the user starts typing: focus leaves to the capture bar,
// but a CSS `:hover` would otherwise persist under the stationary cursor until the
// mouse moves again. Writes the attribute directly (no React state → no re-render).
export function usePointerMode(): void {
  useEffect(() => {
    const root = document.documentElement;
    const set = (mode: 'mouse' | 'keyboard') => {
      if (root.dataset.pointer !== mode) root.dataset.pointer = mode;
    };
    const onMouse = () => set('mouse');
    const onKeyboard = () => set('keyboard');

    set('mouse');
    window.addEventListener('pointermove', onMouse, { passive: true });
    window.addEventListener('pointerdown', onMouse, { passive: true });
    window.addEventListener('keydown', onKeyboard);
    return () => {
      window.removeEventListener('pointermove', onMouse);
      window.removeEventListener('pointerdown', onMouse);
      window.removeEventListener('keydown', onKeyboard);
    };
  }, []);
}
