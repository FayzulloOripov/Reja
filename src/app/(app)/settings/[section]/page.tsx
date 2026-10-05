"use client";

import { useParams } from "next/navigation";
import { SETTINGS_SECTIONS, SettingsShell, type SettingsKey } from "@/components/settings/settings-shell";

export default function SettingsSectionPage() {
  const { section } = useParams<{ section: string }>();
  const key = (SETTINGS_SECTIONS.find((s) => s.key === section)?.key ?? "profile") as SettingsKey;
  return <SettingsShell section={key} />;
}
