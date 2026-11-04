"use client";

import { useEffect } from "react";
import { syncScore, useUsername } from "@/lib/account";

const EVERY_MS = 20_000;

/** Keeps your leaderboard entry up to date while you play. Renders nothing. */
export function ScoreSync() {
  const username = useUsername();
  useEffect(() => {
    if (!username) return;
    const run = () => syncScore().catch(() => {}); // offline: try again next round
    run();
    const id = setInterval(run, EVERY_MS);
    const onHide = () => document.visibilityState === "hidden" && run();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [username]);
  return null;
}
