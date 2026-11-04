"use client";

import { CreateCoin } from "@/components/create/CreateCoin";
import { useMounted } from "@/lib/store";

export default function CreatePage() {
  return useMounted() ? <CreateCoin /> : <div className="p-8 text-center text-sm text-dim">Loading…</div>;
}
