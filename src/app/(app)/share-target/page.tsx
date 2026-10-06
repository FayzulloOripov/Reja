"use client";

import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useRef } from "react";
import { toast } from "sonner";
import { PageContainer } from "@/components/shell/app-client";
import { textToDoc } from "@/components/editor/rich-editor";
import { sharedToTask } from "@/lib/share-target";
import { createTask } from "@/store/actions";
import { useStore } from "@/store/store";

/** Web Share Target: text or a link shared to the installed app becomes an inbox task. */
function ShareTarget() {
  const t = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const ready = useStore((s) => s.status === "ready" || s.status === "cached");
  const done = useRef(false);
  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    const shared = sharedToTask({ title: params.get("title"), text: params.get("text"), url: params.get("url") });
    if (shared) {
      createTask({ title: shared.title, description: shared.body ? textToDoc(shared.body) : null, source: "share" });
      toast.success(t("share.added"));
    }
    router.replace("/inbox");
  }, [ready, params, router, t]);
  return (
    <PageContainer>
      <h1 className="sr-only">{t("share.adding")}</h1>
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {t("share.adding")}</p>
    </PageContainer>
  );
}

export default function ShareTargetPage() {
  return (
    <Suspense>
      <ShareTarget />
    </Suspense>
  );
}
