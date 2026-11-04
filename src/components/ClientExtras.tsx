"use client";

import { useMounted } from "@/lib/store";
import { ScoreSync } from "./account/ScoreSync";
import { Toaster } from "./Toaster";

/** Browser-only helpers mounted once for the whole app. */
export function ClientExtras() {
  if (!useMounted()) return null;
  return (
    <>
      <Toaster />
      <ScoreSync />
    </>
  );
}
