"use client";

import { ThemeProvider } from "./theme";
import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setTranslator } from "@/lib/i18n-client";

function TranslatorBridge() {
  const t = useTranslations();
  // register synchronously too, so actions fired during the first render can translate
  setTranslator((key, values) => t(key as never, values as never));
  useEffect(() => {
    setTranslator((key, values) => t(key as never, values as never));
  }, [t]);
  return null;
}

export function RootProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        <TranslatorBridge />
        {children}
        <Toaster position="bottom-center" richColors={false} closeButton={false} />
      </TooltipProvider>
    </ThemeProvider>
  );
}
