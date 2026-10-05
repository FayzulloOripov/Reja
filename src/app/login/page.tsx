import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "./login-form";
import { LogoMark } from "@/components/brand/logo";
import { APP_NAME, DEMO_MODE } from "@/lib/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("title") };
}

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const t = await getTranslations();
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const error = typeof sp.error === "string" ? sp.error : undefined;

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[oklch(0.25_0.03_45)] p-12 text-[oklch(0.96_0.02_70)] lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-24 size-[420px] rounded-full bg-[oklch(0.66_0.17_50/0.35)] blur-3xl" />
          <div className="absolute -bottom-32 right-0 size-[380px] rounded-full bg-[oklch(0.55_0.15_300/0.3)] blur-3xl" />
        </div>
        <div className="relative flex items-center gap-2.5">
          <LogoMark className="size-9" />
          <span className="font-display text-xl font-bold">{APP_NAME}</span>
        </div>
        <div className="relative max-w-md space-y-6">
          <h1 className="font-display text-4xl leading-tight font-bold">{t("app.tagline")}</h1>
          <HeroPreview />
        </div>
        <p className="relative text-sm opacity-70">© {new Date().getFullYear()} {APP_NAME}</p>
      </section>

      <section className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <LogoMark className="size-9" />
            <span className="font-display text-xl font-bold">{APP_NAME}</span>
          </div>
          <LoginForm next={next} initialError={error} demo={DEMO_MODE} />
        </div>
      </section>
    </main>
  );
}

/** A small, static product preview so the sign-in page shows what's inside. */
function HeroPreview() {
  const rows = [
    { c: "oklch(0.66 0.17 50)", w: "78%", star: true },
    { c: "oklch(0.55 0.17 275)", w: "64%", star: true },
    { c: "oklch(0.62 0.14 160)", w: "71%", star: true },
    { c: "oklch(0.62 0.18 358)", w: "52%", star: false },
  ];
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-2xl backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <div className="h-3 w-28 rounded-full bg-white/30" />
        <div className="h-3 w-12 rounded-full bg-white/15" />
      </div>
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className="size-4 rounded-full border-2" style={{ borderColor: r.c }} />
            <span className="h-2.5 rounded-full bg-white/25" style={{ width: r.w }} />
            {r.star && <span className="ml-auto text-xs text-[oklch(0.85_0.13_80)]">★</span>}
          </li>
        ))}
      </ul>
      <div className="mt-5 grid grid-cols-3 gap-2">
        {["oklch(0.66 0.17 50)", "oklch(0.62 0.14 160)", "oklch(0.55 0.17 275)"].map((c) => (
          <div key={c} className="rounded-lg bg-white/[0.07] p-2.5">
            <div className="mb-2 h-1.5 w-8 rounded-full" style={{ background: c }} />
            <div className="h-1.5 w-full rounded-full bg-white/15">
              <div className="h-full rounded-full" style={{ width: "62%", background: c }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
