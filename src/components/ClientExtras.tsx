"use client";

import { useEffect } from "react";
import { startShared } from "@/lib/shared";
import { useMounted } from "@/lib/store";
import { ScoreSync } from "./account/ScoreSync";
import { Toaster } from "./Toaster";

/** Browser-only helpers mounted once for the whole app. */
export function ClientExtras() {
  const mounted = useMounted();
  useEffect(() => {
    if (mounted) startShared(); // keep public (multiplayer) coins in sync
  }, [mounted]);
  if (!mounted) return null;
  return (
    <>
      <Toaster />
      <ScoreSync />
    </>
  );
}
