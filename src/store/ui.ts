"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CreateTaskInput } from "./actions";

interface UIState {
  taskPanelId: string | null;
  quickAdd: { open: boolean; defaults?: Partial<CreateTaskInput> };
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  newProjectOpen: boolean;
  /** prefilled values for the new-project dialog (e.g. created from an area group) */
  newProjectDefaults: { areaId?: string | null } | null;
  selection: string[];
  sidebarCollapsed: boolean;
  openTask: (id: string | null) => void;
  openQuickAdd: (defaults?: Partial<CreateTaskInput>) => void;
  closeQuickAdd: () => void;
  setPalette: (open: boolean) => void;
  setShortcuts: (open: boolean) => void;
  setNewProject: (open: boolean, defaults?: { areaId?: string | null }) => void;
  toggleSelect: (id: string, range?: string[]) => void;
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
  toggleSidebar: () => void;
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      taskPanelId: null,
      quickAdd: { open: false },
      paletteOpen: false,
      shortcutsOpen: false,
      newProjectOpen: false,
      newProjectDefaults: null,
      selection: [],
      sidebarCollapsed: false,
      openTask: (id) => set({ taskPanelId: id }),
      openQuickAdd: (defaults) => set({ quickAdd: { open: true, defaults } }),
      closeQuickAdd: () => set({ quickAdd: { open: false } }),
      setPalette: (open) => set({ paletteOpen: open }),
      setShortcuts: (open) => set({ shortcutsOpen: open }),
      setNewProject: (open, defaults) => set({ newProjectOpen: open, newProjectDefaults: open ? (defaults ?? null) : null }),
      toggleSelect: (id, range) =>
        set((s) => {
          if (range?.length) return { selection: Array.from(new Set([...s.selection, ...range])) };
          return { selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id] };
        }),
      setSelection: (ids) => set({ selection: ids }),
      clearSelection: () => set({ selection: [] }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: "reja:ui",
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }),
    },
  ),
);
