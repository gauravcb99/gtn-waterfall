"use client";

import { useEffect } from "react";

// Selects the whole value when any number input gains focus, so typing replaces it.
// Safari (and sometimes Chrome) clears the selection on the mouseup that follows a
// click-to-focus; cancelling that one mouseup keeps the selection.
export default function SelectNumberOnFocus() {
  useEffect(() => {
    let justFocused: HTMLInputElement | null = null;

    function onFocusIn(e: FocusEvent) {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.type === "number" && !t.readOnly) {
        t.select();
        justFocused = t;
      }
    }

    function onMouseUp(e: MouseEvent) {
      if (justFocused && e.target === justFocused) e.preventDefault();
      justFocused = null;
    }

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("mouseup", onMouseUp, true);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("mouseup", onMouseUp, true);
    };
  }, []);

  return null;
}
