"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { toast } from "sonner";
import { bootstrap, setOpErrorListener } from "@/store/store";

/** Loads the signed-in user's data into the store and reports failed writes. */
export function useBootstrap(userId: string, demo?: boolean) {
  const t = useTranslations();
  const locale = useLocale();
  useEffect(() => {
    // each adapter is loaded only when used (the demo never downloads the Supabase client)
    void (async () => {
      const adapter = demo
        ? (await import("@/store/demo-adapter")).createDemoAdapter(locale === "en" ? "en" : "uz")
        : (await import("@/store/supabase-adapter")).createSupabaseAdapter();
      await bootstrap(userId, adapter);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, demo]);
  useEffect(() => {
    setOpErrorListener((err) => {
      toast.error(err.code === "42501" || /row-level security|permission/i.test(err.message) ? t("errors.permission") : t("errors.saveFailed", { message: err.message }));
    });
  }, [t]);
}
