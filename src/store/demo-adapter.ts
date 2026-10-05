"use client";

// In-browser adapter for demo mode. Writes succeed locally and persist through the store's
// IndexedDB snapshot; nothing leaves the browser.

import { buildDemoData } from "@/lib/demo/seed";
import { todayIn } from "@/lib/dates";
import { indexRows } from "./supabase-adapter";
import type { DataAdapter, StoreData } from "./tables";

export function createDemoAdapter(lang: "uz" | "en"): DataAdapter {
  const files = new Map<string, string>();
  let seeded: Partial<StoreData> | null = null;

  return {
    kind: "demo",

    async loadAll(userId) {
      // The snapshot (if any) already holds the user's edits; only seed a brand-new browser.
      const { useStore } = await import("./store");
      const current = useStore.getState().data;
      if (Object.keys(current.tasks).length > 0) return current;
      if (!seeded) {
        const today = todayIn("Asia/Tashkent");
        seeded = indexRows(buildDemoData(userId, today, "Asia/Tashkent", lang) as unknown as Record<string, Record<string, unknown>[]>);
      }
      return seeded;
    },

    async exec() {
      await new Promise((r) => setTimeout(r, 30));
    },

    subscribe() {
      return () => {};
    },

    async loadTaskDetail() {
      return {};
    },

    async loadActivity() {
      return [];
    },

    async loadTrash() {
      return {};
    },

    async rpc<T>(fn: string) {
      if (fn === "create_telegram_link_code") return "DEMO1234" as T;
      if (fn === "regenerate_ics_token") return "demo-token" as T;
      return null as T;
    },

    async upload(path, file) {
      files.set(path, URL.createObjectURL(file));
    },

    async fileUrl(path) {
      return files.get(path) ?? null;
    },

    async removeFile(path) {
      files.delete(path);
    },
  };
}
