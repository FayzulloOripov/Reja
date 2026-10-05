import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { DEMO_MODE } from "@/lib/env";
import { getServerSupabase } from "@/lib/supabase/server";
import { AcceptButton } from "./accept-button";

interface InvitationInfo {
  workspace_name: string;
  project_name: string | null;
  role: string;
  inviter_name: string | null;
  email: string | null;
  valid: boolean;
}

export const metadata = { robots: { index: false } };

export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;
  const t = await getTranslations();
  let info: InvitationInfo | null = null;
  let signedIn = false;
  if (!DEMO_MODE && /^[a-zA-Z0-9]{20,80}$/.test(token)) {
    const supabase = await getServerSupabase();
    const [{ data }, { data: auth }] = await Promise.all([supabase.rpc("get_invitation", { p_token: token }), supabase.auth.getUser()]);
    info = data as InvitationInfo | null;
    signedIn = Boolean(auth.user);
  }
  const name = info?.project_name ?? info?.workspace_name ?? "";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_top,var(--brand-soft),transparent_60%)] p-4">
      <div className="w-full max-w-md space-y-5 rounded-3xl border bg-card p-8 text-center shadow-elev-3">
        <LogoMark className="mx-auto size-12" />
        <h1 className="text-22 font-bold">{t("invite.title")}</h1>
        {!info || !info.valid ? (
          <p className="text-muted-foreground">{t("invite.invalid")}</p>
        ) : (
          <>
            <p className="text-muted-foreground">
              {t("invite.body", { inviter: info.inviter_name ?? "Reja", name, role: t(`settings.roles.${info.role}` as never) })}
            </p>
            {signedIn ? (
              <AcceptButton token={token} name={name} />
            ) : (
              <Button asChild size="lg" className="w-full">
                <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>{t("invite.signInFirst")}</Link>
              </Button>
            )}
            {info.email && <p className="text-xs text-muted-foreground">{info.email}</p>}
          </>
        )}
      </div>
    </main>
  );
}
