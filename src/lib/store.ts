"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Market } from "./sim/market";
import { SETTINGS } from "./settings";

/** Market history simulated before the page shows, so the feed isn't empty. */
const WARMUP_MS = 15 * 60_000;
const LOOP_MS = 100;
/** Hidden tabs get throttled; cap catch-up so returning to the tab can't freeze it. */
const MAX_CATCHUP_MS = 2000;

let market: Market | null = null;
let epochMs = 0;

/** The one market for this browser tab. Starts on first use (client only). */
export function getMarket(): Market {
  if (market) return market;
  const m = new Market({ seed: Math.floor(Math.random() * 2 ** 31), startSol: SETTINGS.startSol });
  m.step(WARMUP_MS);
  epochMs = Math.round((Date.now() - m.time) / 1000) * 1000;
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    m.step(Math.min(now - last, MAX_CATCHUP_MS));
    last = now;
  }, LOOP_MS);
  market = m;
  return m;
}

/** Wall-clock ms for a simulation timestamp. */
export const wallMs = (simMs: number) => epochMs + simMs;

/** Re-render the calling component every `ms` and hand it the market. */
export function useMarket(ms = 250): Market {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return getMarket();
}

export interface TradeOpts {
  slippagePct?: number;
  priorityFeeSol?: number;
}

export function buy(coinId: string, solAmount: number, o: TradeOpts = {}) {
  return getMarket().submit({
    coinId, side: "buy", amount: solAmount,
    slippagePct: o.slippagePct ?? SETTINGS.slippagePct,
    priorityFeeSol: o.priorityFeeSol ?? SETTINGS.priorityFeeSol,
  });
}

/** Sell a percentage of what you hold (minus what's already being sold). */
export function sellPct(coinId: string, pctOfBag: number, o: TradeOpts = {}) {
  const m = getMarket();
  const held = m.positions.get(coinId)?.tokens ?? 0;
  const pending = m.pending
    .filter((p) => p.side === "sell" && p.coinId === coinId)
    .reduce((s, p) => s + p.amount, 0);
  const free = held - pending;
  if (free <= 0) return { ok: false as const, reason: "Nothing to sell" };
  return m.submit({
    coinId, side: "sell", amount: pctOfBag >= 100 ? free : (held * pctOfBag) / 100,
    slippagePct: o.slippagePct ?? SETTINGS.slippagePct,
    priorityFeeSol: o.priorityFeeSol ?? SETTINGS.priorityFeeSol,
  });
}

/** True after hydration. The market is random, so it must never render on the server. */
export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
const noopSubscribe = () => () => {};
