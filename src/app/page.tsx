"use client";

import { Pulse } from "@/components/pulse/Pulse";
import { useMounted } from "@/lib/store";

export default function Home() {
  return useMounted() ? <Pulse /> : <div className="p-8 text-center text-sm text-dim">Booting market…</div>;
}
