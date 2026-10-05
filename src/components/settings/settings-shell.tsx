"use client";

import { Bell, Building2, ChevronLeft, ChevronRight, Database, LayoutTemplate, Plug, Tag, Trash2, User } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { PageHeader } from "@/components/common/bits";
import { NotificationsSection, ProfileSection } from "@/components/settings/personal";
import { DataSection, IntegrationsSection, LabelsSection, TemplatesSection, TrashSection, WorkspaceSection } from "@/components/settings/workspace";
import { PageContainer } from "@/components/shell/app-client";
import { cn } from "@/lib/utils";

export const SETTINGS_SECTIONS = [
  { key: "profile", icon: User },
  { key: "notifications", icon: Bell },
  { key: "integrations", icon: Plug },
  { key: "workspace", icon: Building2 },
  { key: "labels", icon: Tag },
  { key: "templates", icon: LayoutTemplate },
  { key: "trash", icon: Trash2 },
  { key: "data", icon: Database },
] as const;

export type SettingsKey = (typeof SETTINGS_SECTIONS)[number]["key"];

/**
 * Settings. Desktop: section list on the left, content on the right. Phones: /settings shows the
 * list of sections (nothing scrolls off-screen), and each section opens on its own page with a
 * back link.
 */
export function SettingsShell({ section }: { section: SettingsKey | null }) {
  const t = useTranslations("settings");
  const current: SettingsKey = section ?? "profile";
  return (
    <PageContainer>
      <div className={cn(section && "hidden md:block")}>
        <PageHeader title={t("title")} />
      </div>
      {section && (
        <Link href="/settings" className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:text-foreground md:hidden">
          <ChevronLeft className="size-4" aria-hidden /> {t("title")}
        </Link>
      )}

      {/* phones: list of sections on /settings */}
      {!section && (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-elev-1 md:hidden">
          {SETTINGS_SECTIONS.map((s) => (
            <li key={s.key}>
              <Link href={`/settings/${s.key}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-muted/60">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-brand">
                  <s.icon className="size-[18px]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{t(s.key)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t(`sectionHints.${s.key}`)}</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className={cn("gap-6 md:grid md:grid-cols-[13rem_1fr]", !section && "hidden")}>
        <nav aria-label={t("title")} className="hidden md:flex md:flex-col md:gap-1">
          {SETTINGS_SECTIONS.map((s) => (
            <Link
              key={s.key}
              href={`/settings/${s.key}`}
              aria-current={current === s.key ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-lg px-3 text-13 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                current === s.key && "bg-card text-foreground shadow-elev-1",
              )}
            >
              <s.icon className="size-4" aria-hidden />
              {t(s.key)}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 animate-fade-up" key={current}>
          <h2 className="mb-4 text-22 font-bold md:hidden">{t(current)}</h2>
          <Suspense>
            {current === "profile" && <ProfileSection />}
            {current === "notifications" && <NotificationsSection />}
            {current === "integrations" && <IntegrationsSection />}
            {current === "workspace" && <WorkspaceSection />}
            {current === "labels" && <LabelsSection />}
            {current === "templates" && <TemplatesSection />}
            {current === "trash" && <TrashSection />}
            {current === "data" && <DataSection />}
          </Suspense>
        </div>
      </div>
    </PageContainer>
  );
}
