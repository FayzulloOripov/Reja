"use client";

import { Download, Share, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "reja:install-dismissed";
const VISITS_KEY = "reja:visits";

function safeGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked
  }
}

/** Registers the service worker and shows an add-to-home-screen prompt on the second visit. */
export function PwaManager() {
  const t = useTranslations("app");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator && (process.env.NODE_ENV === "production" || location.search.includes("sw=1"))) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
    const visits = Number(safeGet(VISITS_KEY) ?? 0) + 1;
    safeSet(VISITS_KEY, String(visits));
    const wasDismissed = Boolean(safeGet(DISMISS_KEY));
    setDismissed(wasDismissed || visits < 2);

    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    if (ios && !standalone) setShowIos(true);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (dismissed || (!deferred && !showIos)) return null;

  const close = () => {
    safeSet(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="fixed inset-x-3 bottom-24 z-50 mx-auto max-w-sm animate-fade-up rounded-2xl border bg-popover p-4 shadow-elev-4 md:bottom-6 md:left-auto md:right-6">
      <button onClick={close} className="absolute top-3 right-3 rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label={t("installTitle")}>
        <X className="size-4" />
      </button>
      <div className="flex gap-3">
        <LogoMark className="size-10 shrink-0" />
        <div className="space-y-1 pr-5">
          <p className="text-sm font-semibold">{t("installTitle")}</p>
          <p className="text-13 text-muted-foreground">{deferred ? t("installBody") : t("installIosBody")}</p>
          {deferred ? (
            <Button
              size="sm"
              className="mt-2"
              onClick={async () => {
                await deferred.prompt();
                await deferred.userChoice;
                close();
              }}
            >
              <Download /> {t("installAction")}
            </Button>
          ) : (
            <Share className="mt-1 size-4 text-info" aria-hidden />
          )}
        </div>
      </div>
    </div>
  );
}
