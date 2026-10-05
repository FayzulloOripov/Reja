"use client";

import { ThemeProvider } from "./theme";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setTranslator } from "@/lib/i18n-client";

function TranslatorBridge() {
  const t = useTranslations();
  const locale = useLocale();
  // register synchronously too, so actions fired during the first render can translate
  setTranslator((key, values) => t(key as never, values as never), (key) => t.raw(key as never), locale);
  useEffect(() => {
    setTranslator((key, values) => t(key as never, values as never), (key) => t.raw(key as never), locale);
  }, [t, locale]);
  return null;
}

export function RootProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        <TranslatorBridge />
        {children}
        <Toaster
          position="bottom-center"
          richColors={false}
          closeButton={false}
          duration={5000}
          // keep toasts above the mobile tab bar (64px + safe area)
          mobileOffset={{ bottom: "calc(env(safe-area-inset-bottom) + 84px)" }}
        />
      </TooltipProvider>
    </ThemeProvider>
  );
}
