"use client";

import { BotsPage } from "@/components/bots/BotsPage";
import { useMounted } from "@/lib/store";

export default function Page() {
  return useMounted() ? <BotsPage /> : <div className="p-8 text-center text-sm text-dim">Loading…</div>;
}
