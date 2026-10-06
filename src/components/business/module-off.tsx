"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/common/empty-state";
import { PageContainer } from "@/components/shell/app-client";
import { Button } from "@/components/ui/button";

/** Shown when a business module is off for the current workspace. */
export function ModuleOff({ module }: { module: "pipeline" | "money" | "docs" }) {
  const t = useTranslations();
  return (
    <PageContainer>
      <h1 className="sr-only">{t(`modules.${module}`)}</h1>
      <EmptyState
        illustration="folder"
        title={t("modules.offTitle", { name: t(`modules.${module}`) })}
        body={t("modules.offBody")}
        action={
          <Button asChild variant="outline">
            <Link href="/settings/workspace"><Settings /> {t("modules.openSettings")}</Link>
          </Button>
        }
      />
    </PageContainer>
  );
}
