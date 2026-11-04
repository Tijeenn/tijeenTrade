"use client";

/**
 * Multiplayer coins. Coins players launch publicly live in Supabase: one bonding curve,
 * one set of holders and one trade history for everyone. This module mirrors them into
 * your local market every couple of seconds and settles your orders on them via the server.
 */
import { getUsername } from "./account";
import { SOL_USD } from "./sim/curve";
import type { Market, OrderRequest, SharedState } from "./sim/market";
import type { Tweet } from "./sim/social";
import { getMarket, setSharedSubmit, toSimMs } from "./store";
import {
  fetchSharedHoldings, fetchSharedMarket, fetchSharedTrades, hypeShared, launchShared, tradeShared,
  type SharedCoinRow,
} from "./supabase";

export const SYNC_MS = 2000;
export const sharedId = (uuid: string) => "s_" + uuid;

let syncing = false;
let lastTradeId: number | null = null;
let syncedMarket: Market | null = null;

function toState(r: SharedCoinRow): SharedState {
  return {
    uuid: r.id, creator: r.creator, name: r.name, ticker: r.ticker, hue: r.hue, socials: r.socials,
    createdAt: toSimMs(Date.parse(r.created_at)),
    phase: r.phase, rSol: r.r_sol, rTok: r.r_tok, tokensSold: r.tokens_sold, realSol: r.real_sol,
    ruggedAt: r.rugged_at ? toSimMs(Date.parse(r.rugged_at)) : undefined,
    athMcapUsd: r.ath_mcap_sol * SOL_USD, volumeSol: r.volume_sol, buys: r.buys, sells: r.sells,
    lastTradeAt: toSimMs(Date.parse(r.last_trade_at)),
  };
}

const same = (a: string, b: string | null) => !!b && a.toLowerCase() === b.toLowerCase();

/** Pull the shared market from the server into the local mirror. Safe to call any time. */
export async function syncShared(): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const m = getMarket();
    if (m !== syncedMarket) {
      // a new run starts a fresh local market: reload everything
      syncedMarket = m;
      lastTradeId = null;
    }
    const me = getUsername();
    const rows = await fetchSharedMarket();
    const coins = new Map(rows.map((r) => [r.id, m.upsertShared(toState(r), me)]));

    const trades = await fetchSharedTrades(lastTradeId);
    for (const t of trades) {
      lastTradeId = Math.max(lastTradeId ?? 0, t.id);
      const c = coins.get(t.coin_id);
      if (!c) continue;
      const wallet = !t.username ? "crowd" : same(t.username, me) ? "you" : "@" + t.username;
      m.ingestSharedTrade(c, { at: toSimMs(Date.parse(t.at)), side: t.side, sol: t.sol, tokens: t.tokens, wallet, mcapUsd: t.mcap_sol * SOL_USD });
    }

    const holdings = await fetchSharedHoldings([...coins.keys()]);
    for (const r of rows) {
      const c = coins.get(r.id)!;
      const hs = holdings.filter((h) => h.coin_id === r.id);
      m.setSharedHolders(c, hs, r.crowd_tokens, me);
      // the server's holdings are the truth for your bag (e.g. after a reload or a trade from another tab)
      const mine = hs.find((h) => same(h.username, me));
      const busy = m.pending.some((o) => o.coinId === c.id);
      const pos = m.positions.get(c.id);
      if (busy) continue;
      if (mine && !pos) {
        m.positions.set(c.id, { coinId: c.id, ticker: c.ticker, tokens: mine.tokens, costSol: mine.cost_sol, realizedSol: 0, boughtSol: mine.cost_sol, soldSol: 0 });
      } else if (pos && Math.abs((mine?.tokens ?? 0) - pos.tokens) > 1) {
        pos.tokens = mine?.tokens ?? 0;
      }
    }
  } catch {
    // offline or Supabase unreachable: the local game keeps running, try again next tick
  } finally {
    syncing = false;
  }
}

/** Orders on shared coins: reserve funds locally, settle on the server. */
function submitShared(req: OrderRequest) {
  const me = getUsername();
  if (!me) return { ok: false as const, reason: "Log in to trade public coins" };
  const m = getMarket();
  const c = m.coins.get(req.coinId);
  if (!c?.shared) return { ok: false as const, reason: "Coin not found" };
  const r = m.externalOrder(req);
  if (!r.ok) return r;
  tradeShared(me, c.shared.uuid, req.side, req.amount, r.minOut)
    .then((res) => {
      m.externalFill(r.id, { tokens: res.tokens, sol: res.sol, fee: res.fee, mcapUsd: res.mcap_sol * SOL_USD, rug: res.rug });
      void syncShared();
    })
    .catch((e: unknown) => m.externalFail(r.id, e instanceof Error ? e.message : "Trade failed"));
  return { ok: true as const, id: r.id };
}

/** Launch a coin every player can see and trade. Returns the local coin id. */
export async function launchPublic(p: {
  name: string; ticker: string; hue: number; socials: { x: boolean; tg: boolean; web: boolean }; devBuySol: number;
}): Promise<string> {
  const me = getUsername();
  if (!me) throw new Error("Log in to launch a public coin");
  const m = getMarket();
  if (p.devBuySol + 0.02 > m.sol) throw new Error("Insufficient SOL");
  const res = await launchShared({ username: me, ...p, ticker: p.ticker.toUpperCase() });
  const id = sharedId(res.id);
  m.externalLaunch(id, p.ticker.toUpperCase(), res.sol, res.tokens, res.mcap_sol * SOL_USD);
  await syncShared();
  return id;
}

/** Your $TICKER post about a public coin sends your followers in on the server, for everyone. */
export function hypeFromPost(t: Tweet) {
  const me = getUsername();
  const shared = Object.values(t.links).filter((id) => id.startsWith("s_"));
  if (!me || !shared.length || !t.apes) return;
  const each = Math.max(1, Math.round(t.apes / Object.keys(t.links).length));
  for (const id of shared) void hypeShared(me, id.slice(2), each).then(() => syncShared(), () => {});
}

/** Start syncing (once). */
let started = false;
export function startShared() {
  if (started) return;
  started = true;
  setSharedSubmit(submitShared);
  void syncShared();
  setInterval(() => void syncShared(), SYNC_MS);
}
