"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";
import { CoinView } from "@/components/coin/CoinView";
import { useMounted } from "@/lib/store";

const loading = <div className="p-8 text-center text-sm text-dim">Loading…</div>;

function Coin() {
  const { id } = useParams<{ id: string }>();
  return useMounted() ? <CoinView id={id} /> : loading;
}

export default function CoinPage() {
  return (
    <Suspense fallback={loading}>
      <Coin />
    </Suspense>
  );
}
