"use client";

import { Portfolio } from "@/components/portfolio/Portfolio";
import { useMounted } from "@/lib/store";

export default function PortfolioPage() {
  return useMounted() ? <Portfolio /> : <div className="p-8 text-center text-sm text-dim">Loading…</div>;
}
