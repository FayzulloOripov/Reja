"use client";

import { Bell, Building2, Database, LayoutTemplate, Plug, Tag, Trash2, User } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { PageHeader } from "@/components/common/bits";
import { NotificationsSection, ProfileSection } from "@/components/settings/personal";
import { DataSection, IntegrationsSection, LabelsSection, TemplatesSection, TrashSection, WorkspaceSection } from "@/components/settings/workspace";
import { PageContainer } from "@/components/shell/app-client";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { key: "profile", icon: User },
  { key: "notifications", icon: Bell },
  { key: "integrations", icon: Plug },
  { key: "workspace", icon: Building2 },
  { key: "labels", icon: Tag },
  { key: "templates", icon: LayoutTemplate },
  { key: "trash", icon: Trash2 },
  { key: "data", icon: Database },
] as const;

export default function SettingsPage() {
  const t = useTranslations("settings");
  const { section } = useParams<{ section: string }>();
  const current = SECTIONS.find((s) => s.key === section)?.key ?? "profile";
  return (
    <PageContainer>
      <PageHeader title={t("title")} />
      <div className="grid gap-6 md:grid-cols-[13rem_1fr]">
        <nav aria-label={t("title")} className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:flex-col md:px-0">
          {SECTIONS.map((s) => (
            <Link
              key={s.key}
              href={`/settings/${s.key}`}
              aria-current={current === s.key ? "page" : undefined}
              className={cn(
                "flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 text-13 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                current === s.key && "bg-card text-foreground shadow-elev-1",
              )}
            >
              <s.icon className="size-4" />
              {t(s.key)}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 animate-fade-up" key={current}>
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
