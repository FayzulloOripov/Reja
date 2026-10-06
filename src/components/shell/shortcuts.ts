"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useUI } from "@/store/ui";

export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable || Boolean(el.closest("[contenteditable=true]"));
}

const GO: Record<string, string> = { h: "/", i: "/inbox", u: "/upcoming", o: "/overview", n: "/notifications", r: "/reports", g: "/goals" };

/** App-wide shortcuts: Q quick add, ⌘K palette, ? help, g + key to navigate. */
export function useGlobalShortcuts() {
  const router = useRouter();
  useEffect(() => {
    let pendingG = 0;
    function onKey(e: KeyboardEvent) {
      const ui = useUI.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ui.setPalette(!ui.paletteOpen);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      // the task panel is a non-modal sheet: shortcuts (and Escape to close it) keep working beside it
      if (ui.quickAdd.open || ui.paletteOpen || document.querySelector("[role=dialog][data-state=open]:not([data-task-panel])")) return;

      if (pendingG && Date.now() - pendingG < 1200) {
        pendingG = 0;
        const dest = GO[e.key.toLowerCase()];
        if (dest) {
          e.preventDefault();
          router.push(dest);
        }
        return;
      }
      switch (e.key) {
        case "q":
        case "Q":
          e.preventDefault();
          ui.openQuickAdd();
          break;
        case "?":
          e.preventDefault();
          ui.setShortcuts(true);
          break;
        case "g":
          pendingG = Date.now();
          break;
        case "Escape":
          if (ui.selection.length) ui.clearSelection();
          else if (ui.taskPanelId) ui.openTask(null);
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
}
