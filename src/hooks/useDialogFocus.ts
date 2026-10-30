import { useEffect, useRef, type RefObject } from 'react';

const dialogStack: object[] = [];
let originalOverflow = '';

/** Focus and scroll ownership for an open dialog; nested dialogs restore their owner. */
export function useDialogFocus(isOpen: boolean, onClose: () => void, initialFocusRef?: RefObject<HTMLElement | null>) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const owner = {};
    if (!dialogStack.length) originalOverflow = document.body.style.overflow;
    dialogStack.push(owner);
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => (initialFocusRef?.current ?? focusable()[0] ?? ref.current)?.focus());
    const key = (event: KeyboardEvent) => {
      // An inline editor may own Escape or Tab before the enclosing dialog.
      if (event.defaultPrevented || dialogStack[dialogStack.length - 1] !== owner) return;
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const nodes = focusable(); const first = nodes[0]; const last = nodes[nodes.length - 1];
      if (!first) { event.preventDefault(); ref.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !ref.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !ref.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', key);
      const wasTop = dialogStack[dialogStack.length - 1] === owner;
      dialogStack.splice(dialogStack.indexOf(owner), 1);
      if (!dialogStack.length) document.body.style.overflow = originalOverflow;
      if (wasTop && previous?.isConnected) previous.focus();
    };
  }, [isOpen, initialFocusRef]);
  return ref;
}
