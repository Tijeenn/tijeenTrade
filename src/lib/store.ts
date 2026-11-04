"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Market } from "./sim/market";
import { restore, snapshot, type MarketSave } from "./sim/persist";
import { Social, type SocialSave } from "./sim/social";
import { SETTINGS } from "./settings";

/** Market history simulated before the page shows, so the feed isn't empty. */
const WARMUP_MS = 15 * 60_000;
const LOOP_MS = 100;
/** Hidden tabs get throttled; cap catch-up so returning to the tab can't freeze it. */
const MAX_CATCHUP_MS = 2000;

const SAVE_KEY = "tijeen.save.v1";
const SAVE_EVERY_MS = 5000;
const EQUITY_EVERY_MS = 10_000;
const MAX_EQUITY_POINTS = 3000;

/** One "run" = one starting balance. Resetting starts a new run. */
export interface Run {
  startedAt: number; // wall ms
  equity: [number, number][]; // [wall ms, SOL]
}

interface SaveFile {
  run: Run;
  market: MarketSave;
  social?: SocialSave;
}

let market: Market | null = null;
let social = new Social(Math.floor(Math.random() * 2 ** 31));
let run: Run = { startedAt: 0, equity: [] };
let epochMs = 0;

/** Social feed history simulated at the end of the warm-up, so it isn't empty either. */
const SOCIAL_WARMUP_MS = 2 * 60_000;

function freshMarket(startSol: number, s: Social): Market {
  const m = new Market({ seed: Math.floor(Math.random() * 2 ** 31), startSol });
  m.step(WARMUP_MS - SOCIAL_WARMUP_MS);
  for (let t = 0; t < SOCIAL_WARMUP_MS; t += 5000) {
    m.step(5000);
    s.step(m);
  }
  epochMs = Math.round((Date.now() - m.time) / 1000) * 1000;
  return m;
}

function readSave(): SaveFile | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as SaveFile) : null;
  } catch {
    return null;
  }
}

export function save(): void {
  if (!market) return;
  const file: SaveFile = { run, market: snapshot(market), social: social.save(market.time) };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(file));
  } catch {
    // Over quota: drop the chart history of saved coins and try once more.
    for (const c of file.market.coins) c.candles = c.candles.slice(-120);
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(file));
    } catch {
      /* storage unavailable; keep playing unsaved */
    }
  }
}

function startLoop() {
  let last = performance.now();
  let lastSave = 0;
  let lastEquity = 0;
  setInterval(() => {
    const now = performance.now();
    market!.step(Math.min(now - last, MAX_CATCHUP_MS));
    social.step(market!);
    last = now;
    if (now - lastEquity >= EQUITY_EVERY_MS) {
      lastEquity = now;
      run.equity.push([Date.now(), market!.equity()]);
      if (run.equity.length > MAX_EQUITY_POINTS) run.equity.splice(0, run.equity.length - MAX_EQUITY_POINTS);
    }
    if (now - lastSave >= SAVE_EVERY_MS) {
      lastSave = now;
      save();
    }
  }, LOOP_MS);
  const flush = () => document.visibilityState === "hidden" && save();
  document.addEventListener("visibilitychange", flush);
  window.addEventListener("pagehide", save);
}

/** The one market for this browser tab. Starts on first use (client only). */
export function getMarket(): Market {
  if (market) return market;
  const saved = readSave();
  if (saved) {
    market = freshMarket(saved.market.startSol, social);
    try {
      restore(market, saved.market);
      run = saved.run;
      if (saved.social) social.load(saved.social, market.time);
    } catch {
      market = freshMarket(SETTINGS.startSol, social); // corrupt save: start over
      run = { startedAt: Date.now(), equity: [[Date.now(), market.startSol]] };
    }
  } else {
    market = freshMarket(SETTINGS.startSol, social);
    run = { startedAt: Date.now(), equity: [[Date.now(), market.startSol]] };
  }
  startLoop();
  return market;
}

/** Simulated crypto Twitter for this tab. */
export function getSocial(): Social {
  getMarket();
  return social;
}

export function getRun(): Run {
  getMarket();
  return run;
}

/** Wipe everything and start a new run with `startSol`. */
export function resetRun(startSol: number): void {
  const old = getMarket(); // make sure the loop is running
  const account = social.save(old.time); // your followers and posts survive a new run
  social = new Social(Math.floor(Math.random() * 2 ** 31));
  market = freshMarket(startSol, social);
  social.load(account, market.time);
  run = { startedAt: Date.now(), equity: [[Date.now(), startSol]] };
  save();
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
