"use client";

import { FolderKanban, Inbox, Menu, Plus, Search, SunMedium } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ProjectDot } from "@/components/common/bits";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useCurrentWorkspace, useProjects } from "@/store/hooks";
import { useUI } from "@/store/ui";
import { UserMenu, WorkspaceSwitcher, useNavItems } from "./sidebar";

/** Bottom tab bar under 768px: Today, Inbox, [+], Projects, More. */
export function MobileTabBar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  const [sheet, setSheet] = useState<null | "projects" | "more">(null);
  const { primary, secondary } = useNavItems();
  const ws = useCurrentWorkspace();
  const projects = useProjects(ws?.id);
  const setNewProject = useUI((s) => s.setNewProject);

  const tab = (href: string, label: string, Icon: typeof Inbox, badge?: number) => {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn("relative flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium", active ? "text-brand-fg" : "text-muted-foreground")}
      >
        <Icon className={cn("size-[22px]", active && "text-brand")} />
        {label}
        {!!badge && <span className="tnum absolute top-1 left-1/2 ml-2 rounded-full bg-muted px-1 text-[10px] text-muted-foreground">{badge}</span>}
      </Link>
    );
  };

  return (
    <>
      <nav
        aria-label={t("mainNav")}
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/92 backdrop-blur-lg md:hidden"
      >
        <div className="flex items-end">
          {tab("/", t("home"), SunMedium, primary[0].badge)}
          {tab("/inbox", t("inbox"), Inbox, primary[1].badge)}
          <div className="flex flex-1 justify-center">
            <button
              onClick={() => openQuickAdd()}
              aria-label={t("newTask")}
              className="-mt-5 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-elev-3 transition-transform active:scale-95"
            >
              <Plus className="size-7" />
            </button>
          </div>
          <button
            onClick={() => setSheet("projects")}
            className={cn("flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium", pathname.startsWith("/projects") ? "text-brand-fg" : "text-muted-foreground")}
          >
            <FolderKanban className="size-[22px]" />
            {t("projects")}
          </button>
          <button onClick={() => setSheet("more")} className="relative flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium text-muted-foreground">
            <Menu className="size-[22px]" />
            {t("more")}
            {!!primary[4].badge && <span className="absolute top-1.5 left-1/2 ml-2 size-2 rounded-full bg-destructive" />}
          </button>
        </div>
      </nav>

      <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-2xl p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle>{sheet === "projects" ? t("projects") : t("more")}</SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto px-3 pb-8">
            {sheet === "projects" ? (
              <ul className="py-2">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} onClick={() => setSheet(null)} className="flex h-12 items-center gap-3 rounded-xl px-3 text-[15px] hover:bg-muted">
                      <ProjectDot color={p.color} size="lg" />
                      <span className="truncate">{p.name}</span>
                    </Link>
                  </li>
                ))}
                <li className="pt-2">
                  <Button variant="outline" className="h-11 w-full" onClick={() => { setSheet(null); setNewProject(true); }}>
                    <Plus /> {t("newProject")}
                  </Button>
                </li>
              </ul>
            ) : (
              <div className="space-y-3 py-3">
                <WorkspaceSwitcher />
                <ul className="grid grid-cols-3 gap-2">
                  {[...primary.slice(2), ...secondary].map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setSheet(null)}
                        className="relative flex flex-col items-center gap-1.5 rounded-xl border bg-card p-3 text-xs font-medium shadow-elev-1"
                      >
                        <item.icon className="size-5 text-brand" />
                        {item.label}
                        {!!item.badge && <span className="absolute top-2 right-2 rounded-full bg-destructive px-1.5 text-[10px] text-white">{item.badge}</span>}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <button
                      onClick={() => { setSheet(null); useUI.getState().setPalette(true); }}
                      className="flex w-full flex-col items-center gap-1.5 rounded-xl border bg-card p-3 text-xs font-medium shadow-elev-1"
                    >
                      <Search className="size-5 text-brand" />
                      {t("search")}
                    </button>
                  </li>
                </ul>
                <UserMenu />
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Compact top bar on mobile with the workspace mark and search. */
export function MobileTopBar() {
  const setPalette = useUI((s) => s.setPalette);
  const t = useTranslations("nav");
  return (
    <div className="pt-safe sticky top-0 z-30 flex items-center justify-between border-b bg-background/92 px-4 py-2 backdrop-blur-lg md:hidden">
      <Link href="/" aria-label="Reja" className="flex items-center gap-2">
        <LogoMark className="size-7" />
      </Link>
      <Button variant="ghost" size="icon" onClick={() => setPalette(true)} aria-label={t("search")}>
        <Search className="size-5" />
      </Button>
    </div>
  );
}
