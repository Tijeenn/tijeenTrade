"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Market, type OrderRequest } from "./sim/market";
import { restore, snapshot, type MarketSave } from "./sim/persist";
import { Bots, DEFAULT_BOTS, type BotsConfig, type BotsSave } from "./sim/bots";
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
  bots?: BotsSave;
}

let market: Market | null = null;
let social = new Social(Math.floor(Math.random() * 2 ** 31));
const BOTS_KEY = "tijeen.bots.v1";
let bots = new Bots(loadBotsConfig());

/** Bot settings live in this browser (like the trading settings), separate from the run. */
function loadBotsConfig(): BotsConfig {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(BOTS_KEY) : null;
    if (!raw) return DEFAULT_BOTS;
    const saved = JSON.parse(raw) as Partial<BotsConfig>;
    // merge so settings added later get their defaults
    return {
      sniper: { ...DEFAULT_BOTS.sniper, ...saved.sniper, exit: { ...DEFAULT_BOTS.sniper.exit, ...saved.sniper?.exit } },
      posts: { ...DEFAULT_BOTS.posts, ...saved.posts, exit: { ...DEFAULT_BOTS.posts.exit, ...saved.posts?.exit } },
      migration: { ...DEFAULT_BOTS.migration, ...saved.migration, exit: { ...DEFAULT_BOTS.migration.exit, ...saved.migration?.exit } },
    };
  } catch {
    return DEFAULT_BOTS;
  }
}

/** Change bot settings (takes effect on the next tick) and remember them. */
export function updateBots(next: BotsConfig): void {
  bots.config = structuredClone(next);
  try {
    localStorage.setItem(BOTS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}
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
  const file: SaveFile = { run, market: snapshot(market), social: social.save(market.time), bots: bots.save(market.time) };
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
    bots.step(market!, social);
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
      if (saved.bots) bots.load(saved.bots, market.time);
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

/** Your trading bots for this tab. */
export function getBots(): Bots {
  getMarket();
  return bots;
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
  bots = new Bots(bots.config); // fresh stats for the new run, same settings
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

/** Sim time for a wall-clock timestamp (e.g. a server time). */
export const toSimMs = (wall: number) => wall - epochMs;

type OrderResult = { ok: true; id: number } | { ok: false; reason: string };
let sharedSubmit: ((req: OrderRequest) => OrderResult) | null = null;

/** The multiplayer module settles orders on shared coins through the server. */
export function setSharedSubmit(fn: (req: OrderRequest) => OrderResult) {
  sharedSubmit = fn;
}

/** Local coins fill in the sim; shared (public) coins are settled by the server. */
function submit(req: OrderRequest): OrderResult {
  const m = getMarket();
  if (m.coins.get(req.coinId)?.shared) {
    return sharedSubmit ? sharedSubmit(req) : { ok: false, reason: "Public coins are still loading" };
  }
  return m.submit(req);
}

export function buy(coinId: string, solAmount: number, o: TradeOpts = {}) {
  return submit({
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
  return submit({
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
