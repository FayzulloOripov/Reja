"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { toast } from "sonner";
import { createDemoAdapter } from "@/store/demo-adapter";
import { bootstrap, setOpErrorListener } from "@/store/store";
import { createSupabaseAdapter } from "@/store/supabase-adapter";

/** Loads the signed-in user's data into the store and reports failed writes. */
export function useBootstrap(userId: string, demo?: boolean) {
  const t = useTranslations();
  const locale = useLocale();
  useEffect(() => {
    void bootstrap(userId, demo ? createDemoAdapter(locale === "en" ? "en" : "uz") : createSupabaseAdapter());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, demo]);
  useEffect(() => {
    setOpErrorListener((err) => {
      toast.error(err.code === "42501" || /row-level security|permission/i.test(err.message) ? t("errors.permission") : t("errors.saveFailed", { message: err.message }));
    });
  }, [t]);
}
