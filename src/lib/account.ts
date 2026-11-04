"use client";

import { useSyncExternalStore } from "react";
import { portfolioStats } from "./portfolio";
import { getMarket, getRun } from "./store";
import { joinPlayer, submitScore, type ScoreReport } from "./supabase";

const KEY = "tijeen.user.v1";
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function write(name: string | null) {
  try {
    if (name) localStorage.setItem(KEY, name);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

/** The logged-in username, or null for guests. */
export function useUsername(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => null,
  );
}

export const getUsername = read;

export async function login(name: string): Promise<void> {
  const p = await joinPlayer(name.trim());
  write(p.username); // use the stored casing
  lastSent = "";
  await syncScore();
}

export function logout() {
  write(null);
}

let lastSent = "";

/** Report the current run if anything changed since the last report. */
export async function syncScore(): Promise<void> {
  const username = read();
  if (!username) return;
  const m = getMarket();
  const s = portfolioStats(m);
  const report: ScoreReport = {
    username,
    runStartedAt: getRun().startedAt,
    startSol: m.startSol,
    equitySol: Math.round(s.equity * 1e6) / 1e6,
    closedTrades: s.closed.length,
    wins: s.closed.filter((p) => p.realizedSol > 0).length,
  };
  const key = JSON.stringify(report);
  if (key === lastSent) return;
  await submitScore(report);
  lastSent = key;
}
