"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Illustration } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");
  const tc = useTranslations("common");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 p-6 text-center">
      <Illustration name="search" />
      <h1 className="text-22 font-bold">{t("title")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t("body")}</p>
      {error.digest && <p className="font-mono text-xs text-subtle-foreground">#{error.digest}</p>}
      <div className="mt-2 flex gap-2">
        <Button onClick={reset}>
          <RotateCcw /> {tc("tryAgain")}
        </Button>
        <Button asChild variant="outline">
          <Link href="/">{t("goHome")}</Link>
        </Button>
      </div>
    </main>
  );
}
