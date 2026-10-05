import { getTranslations } from "next-intl/server";
import { Illustration } from "@/components/common/empty-state";

export const dynamic = "force-static";

export default async function OfflinePage() {
  const t = await getTranslations("errors");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <Illustration name="inbox" />
      <h1 className="text-22 font-bold">{t("offlineTitle")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t("offlineBody")}</p>
    </main>
  );
}
