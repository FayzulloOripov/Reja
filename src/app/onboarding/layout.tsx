import { redirect } from "next/navigation";
import { DEMO_USER_ID } from "@/lib/demo/seed";
import { DEMO_MODE } from "@/lib/env";
import { getServerSupabase } from "@/lib/supabase/server";
import { OnboardingClient } from "./onboarding-client";

export default async function OnboardingLayout() {
  if (DEMO_MODE) return <OnboardingClient userId={DEMO_USER_ID} demo />;
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <OnboardingClient userId={user.id} />;
}
