"use client";

import { SettingsForm } from "@/components/settings/SettingsForm";
import { useMounted } from "@/lib/store";

export default function SettingsPage() {
  return useMounted() ? <SettingsForm /> : <div className="p-8 text-center text-sm text-dim">Loading…</div>;
}
