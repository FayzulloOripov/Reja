"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acceptInvitation } from "@/server/actions/invitations";

export function AcceptButton({ token, name }: { token: string; name: string }) {
  const t = useTranslations("invite");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await acceptInvitation(token);
            if (!res.ok) {
              setError(res.error === "wrong_email" ? t("wrongEmail", { email: "" }) : t("invalid"));
              return;
            }
            toast.success(t("accepted", { name }));
            router.replace(res.projectId ? `/projects/${res.projectId}` : "/overview");
          })
        }
      >
        {pending && <Loader2 className="animate-spin" />} {t("accept")}
      </Button>
      {error && <p role="alert" className="text-sm text-danger-fg">{error}</p>}
    </div>
  );
}
