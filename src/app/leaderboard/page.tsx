"use client";

import { Leaderboard } from "@/components/leaderboard/Leaderboard";
import { useMounted } from "@/lib/store";

export default function LeaderboardPage() {
  return useMounted() ? <Leaderboard /> : <div className="p-8 text-center text-sm text-dim">Loading…</div>;
}
