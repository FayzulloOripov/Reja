"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SettingsShell } from "@/components/settings/settings-shell";

export default function Settings() {
  const router = useRouter();
  // desktop has room for the list and a section side by side: open the profile right away
  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) router.replace("/settings/profile");
  }, [router]);
  return <SettingsShell section={null} />;
}
