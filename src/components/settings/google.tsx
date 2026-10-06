"use client";

import { CalendarSync, Loader2, RefreshCw, Unplug } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reloadGoogleStatus, useGoogleStatus } from "@/hooks/use-google";
import { useFormat } from "@/lib/format";
import { refresh } from "@/store/store";
import { useToday, useTz } from "@/store/hooks";
import { SettingsCard, SettingsRow } from "./common";

/** Two-way Google Calendar: busy time comes in, time blocks marked for Google go out. */
export function GoogleCalendarCard() {
  const t = useTranslations("calendarSync");
  const params = useSearchParams();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const status = useGoogleStatus();
  const [busy, setBusy] = useState(false);
  const result = params.get("google");
  useEffect(() => {
    if (result === "connected") toast.success(t("connectedToast"));
    if (result === "error") toast.error(t("errorToast"));
  }, [result, t]);

  const title = <span className="flex items-center gap-2"><CalendarSync className="size-4 text-info" /> {t("title")}</span>;
  if (!status) return <SettingsCard title={title}><p className="px-5 py-4 text-13 text-muted-foreground"><Loader2 className="inline size-4 animate-spin" /></p></SettingsCard>;
  if (!status.configured) {
    return (
      <SettingsCard title={title} description={t("hint")} actions={<span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-semibold text-muted-foreground">{t("soon")}</span>}>
        <p className="px-5 py-4 text-13 text-muted-foreground">{t("notConfigured")}</p>
      </SettingsCard>
    );
  }
  return (
    <SettingsCard title={title} description={t("hint")}>
      {status.connected ? (
        <>
          <SettingsRow label={t("connectedAs", { email: status.email ?? "Google" })} description={status.lastSyncedAt ? t("lastSync", { when: f.ago(status.lastSyncedAt) }) : t("neverSynced")}>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const res = await fetch("/api/google/sync", { method: "POST" });
                await reloadGoogleStatus();
                await refresh();
                setBusy(false);
                if (res.ok) toast.success(t("synced"));
                else toast.error(t("errorToast"));
              }}
            >
              {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} {t("syncNow")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await fetch("/api/google/disconnect", { method: "POST" });
                await reloadGoogleStatus();
                await refresh();
              }}
            >
              <Unplug /> {t("disconnect")}
            </Button>
          </SettingsRow>
          {status.lastError && <p className="px-5 pb-3 text-xs text-danger-fg" role="alert">{t("lastError", { message: status.lastError })}</p>}
          <p className="px-5 py-3 text-xs text-muted-foreground">{t("blockHint")}</p>
        </>
      ) : (
        <div className="px-5 py-4">
          <Button asChild size="sm">
            <a href="/api/google/connect"><CalendarSync /> {t("connect")}</a>
          </Button>
        </div>
      )}
    </SettingsCard>
  );
}
