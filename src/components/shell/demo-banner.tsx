"use client";

import { FlaskConical, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FORCED_DEMO } from "@/lib/env";

const SEEN_KEY = "reja:demo-banner-seen";

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Demo-mode notice: a full-width banner the first time, then a small pill that can be reopened. */
export function DemoBanner() {
  const t = useTranslations("app");
  const [open, setOpen] = useState(() => !readSeen());

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // storage unavailable: the banner simply shows again next time
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed top-2 right-14 z-40 inline-flex h-7 items-center gap-1.5 rounded-full border bg-info-soft px-2.5 text-xs font-medium text-info-fg shadow-elev-1 md:top-3 md:right-4"
        aria-label={t("demoPill")}
      >
        <FlaskConical className="size-3.5" aria-hidden /> {t("demoShort")}
      </button>
    );
  }

  return (
    <div role="note" className="flex items-center gap-2 bg-info-soft py-1.5 pr-1 pl-4 text-xs font-medium text-info-fg">
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">{t("demoBanner")}</p>
      {!FORCED_DEMO && (
        <a href="/demo/exit" className="shrink-0 rounded-md px-2 py-1 font-semibold underline-offset-4 hover:underline">
          {t("demoSignUp")}
        </a>
      )}
      <button onClick={close} aria-label={t("demoHide")} className="inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-info/10">
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
