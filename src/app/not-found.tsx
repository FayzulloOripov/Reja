import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Illustration } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <Illustration name="search" />
      <h1 className="text-22 font-bold">{t("notFound")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t("notFoundBody")}</p>
      <Button asChild className="mt-2">
        <Link href="/">{t("goHome")}</Link>
      </Button>
    </main>
  );
}
