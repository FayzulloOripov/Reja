"use client";

import { CloudOff, FlaskConical } from "lucide-react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMounted, useTheme } from "@/components/providers/theme";
import { useEffect, useRef, type ReactNode } from "react";
import { setLocaleCookie } from "@/server/actions/locale";
import { useMe } from "@/store/hooks";
import { useStore } from "@/store/store";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { MobileTabBar, MobileTopBar } from "./mobile-nav";
import { FocusPill } from "./focus-pill";
import { PwaManager } from "./pwa";
import { Sidebar } from "./sidebar";
import { useGlobalShortcuts } from "./shortcuts";
import { cn } from "@/lib/utils";
import { useUI } from "@/store/ui";

const Overlays = dynamic(() => import("./overlays").then((m) => m.Overlays), { ssr: false });

export function AppClient({ userId, demo, children }: { userId: string; demo?: boolean; children: ReactNode }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const status = useStore((s) => s.status);
  const online = useStore((s) => s.online);
  const pending = useStore((s) => s.outbox.length);
  const me = useMe();
  const { setTheme } = useTheme();
  const synced = useRef({ theme: false, lang: false });
  const mounted = useMounted();

  useBootstrap(userId, demo);

  // keep theme and language in line with the profile (once per session)
  useEffect(() => {
    if (!me) return;
    if (!synced.current.theme) {
      synced.current.theme = true;
      if (me.theme) setTheme(me.theme);
    }
    if (!synced.current.lang) {
      synced.current.lang = true;
      if (me.language && me.language !== locale) {
        void setLocaleCookie(me.language).then(() => router.refresh());
      }
    }
  }, [me, locale, router, setTheme]);

  useGlobalShortcuts();

  // PWA shortcut: /?quickadd=1 opens quick add
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("quickadd") === "1") {
      useUI.getState().openQuickAdd();
      sp.delete("quickadd");
      window.history.replaceState(null, "", `${window.location.pathname}${sp.size ? `?${sp}` : ""}`);
    }
  }, []);

  const showSkeleton = !mounted || ((status === "loading" || status === "idle") && !me);

  return (
    <div className="flex min-h-dvh bg-background">
      <a href="#main" className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        {t("nav.skipToContent")}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        {demo && (
          <div className="flex items-center justify-center gap-2 bg-info-soft px-4 py-1.5 text-xs font-medium text-info-fg">
            <FlaskConical className="size-3.5" /> {t("app.demoBanner")}
          </div>
        )}
        {mounted && !online && (
          <div role="status" className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-1.5 text-xs font-medium text-warning-fg">
            <CloudOff className="size-3.5" />
            {t("app.offline")}
            {pending > 0 && <span className="tnum">· {t("app.syncing", { count: pending })}</span>}
          </div>
        )}
        <main id="main" tabIndex={-1} className={cn("flex-1 pb-28 outline-none md:pb-0")}>
          {showSkeleton ? <ShellSkeleton /> : children}
        </main>
      </div>
      <MobileTabBar />
      <Overlays />
      {mounted && <PwaManager />}
      <FocusPill />
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-10" aria-busy="true">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
      <div className="h-4 w-80 animate-pulse rounded bg-muted" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" style={{ opacity: 1 - i * 0.15 }} />
        ))}
      </div>
    </div>
  );
}

export function PageContainer({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn("mx-auto w-full px-4 py-5 sm:px-6 md:py-8 lg:px-10", wide ? "max-w-[1400px]" : "max-w-5xl", className)}>{children}</div>;
}
