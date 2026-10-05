import { LogoMark } from "@/components/brand/logo";

/** Shown when the deployment has no Supabase keys yet (developer-facing, intentionally English). */
export function SetupNeeded() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md space-y-4 rounded-2xl border bg-card p-8 shadow-elev-2">
        <LogoMark className="size-10" />
        <h1 className="text-22 font-bold">Configure Supabase</h1>
        <p className="text-sm text-muted-foreground">
          Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> (see README), or run locally with{" "}
          <code>NEXT_PUBLIC_DEMO=1</code>.
        </p>
        <a href="/demo" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
          Open the demo →
        </a>
      </div>
    </main>
  );
}
