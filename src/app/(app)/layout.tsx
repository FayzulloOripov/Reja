import { redirect } from "next/navigation";
import { AppClient } from "@/components/shell/app-client";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { DEMO_USER_ID } from "@/lib/demo/seed";
import { isDemoRequest } from "@/lib/demo/server";
import { supabaseConfigured } from "@/lib/env";
import { getServerSupabase } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  if (await isDemoRequest()) {
    return (
      <AppClient userId={DEMO_USER_ID} demo>
        {children}
      </AppClient>
    );
  }
  if (!supabaseConfigured) return <SetupNeeded />;

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("onboarded_at").eq("id", user.id).maybeSingle();
  if (profile && !profile.onboarded_at) redirect("/onboarding");

  return <AppClient userId={user.id}>{children}</AppClient>;
}
