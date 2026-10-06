"use client";

import { ArrowLeft, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendMagicLink } from "@/server/actions/auth";
import { setLocaleCookie } from "@/server/actions/locale";

export function LoginForm({ next, initialError, demo, fromDemo }: { next?: string; initialError?: string; demo: boolean; fromDemo?: boolean }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(initialError === "link" ? t("linkError") : null);
  const [pending, start] = useTransition();
  const [google, setGoogle] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await sendMagicLink({ email, next, language: locale as "uz" | "en" });
      if (res.ok) setSent(true);
      else setError(res.error === "invalid" ? t("invalidEmail") : res.error === "rate_limited" ? t("rateLimited") : (res.message ?? t("linkError")));
    });
  }

  async function signInWithGoogle() {
    setGoogle(true);
    const redirectTo = new URL("/auth/callback", window.location.origin);
    if (next) redirectTo.searchParams.set("next", next);
    // the Supabase client loads only when it is needed (keeps the sign-in page light)
    const { getBrowserSupabase } = await import("@/lib/supabase/client");
    const { error } = await getBrowserSupabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo.toString() } });
    if (error) {
      setError(error.message);
      setGoogle(false);
    }
  }

  async function switchLocale(l: "uz" | "en") {
    await setLocaleCookie(l);
    router.refresh();
  }

  const localeSwitch = (
    <div className="flex gap-1 text-xs" role="group" aria-label="Language">
      {(["uz", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchLocale(l)}
          aria-pressed={locale === l}
          className="rounded-md px-2 py-1 font-medium text-muted-foreground uppercase aria-pressed:bg-muted aria-pressed:text-foreground"
        >
          {l === "uz" ? "Oʻzbekcha" : "English"}
        </button>
      ))}
    </div>
  );

  if (sent) {
    return (
      <div className="animate-fade-up space-y-6">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-fg">
          <Mail className="size-6" />
        </div>
        <div className="space-y-2">
          <h1 className="text-28 font-bold">{t("checkEmail")}</h1>
          <p className="text-muted-foreground">{t("checkEmailBody", { email })}</p>
        </div>
        <Button variant="ghost" onClick={() => setSent(false)} className="-ml-2">
          <ArrowLeft /> {t("useDifferent")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-28 font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      {fromDemo && !demo && (
        <p role="status" className="rounded-xl bg-info-soft px-3 py-2.5 text-13 text-info-fg">{t("fromDemo")}</p>
      )}

      {demo ? (
        <Button asChild size="lg" className="h-11 w-full text-base">
          <Link href="/">{t("openDemo")} →</Link>
        </Button>
      ) : (
        <>
          <form onSubmit={submit} className="space-y-3" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("emailLabel")}</Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                required
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 text-base"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "login-error" : undefined}
              />
            </div>
            {error && (
              <p id="login-error" role="alert" className="text-sm text-danger-fg">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={pending || !email}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {pending ? t("sending") : t("sendLink")}
            </Button>
          </form>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("orContinue")}
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" size="lg" className="h-11 w-full text-base" onClick={signInWithGoogle} disabled={google}>
            {google ? <Loader2 className="animate-spin" /> : <GoogleIcon />}
            {t("google")}
          </Button>

          {!fromDemo && (
            <p className="text-center text-13 text-muted-foreground">
              {t("tryDemo")}{" "}
              <a href="/demo" className="font-medium text-brand-fg underline-offset-4 hover:underline">
                {t("openDemo")}
              </a>
            </p>
          )}
        </>
      )}

      <div className="flex items-center justify-between border-t pt-5">
        <p className="max-w-[16rem] text-xs text-muted-foreground">{t("terms")}</p>
        {localeSwitch}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}
