/**
 * Tiny Supabase REST client for the leaderboard.
 * The URL and publishable key are public by design (every visitor's browser gets them);
 * the database only allows reads plus the two validated functions.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://vyyjovgajgvnvkvzptlc.supabase.co";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_APVxZCmuob9cDBzPbNMDfw_SwdJHrLR";

export const MIN_TRADES_TO_RANK = 5;

export interface Player {
  username: string;
  created_at: string;
  run_started_at: string | null;
  start_sol: number | null;
  equity_sol: number | null;
  return_pct: number | null;
  closed_trades: number;
  wins: number;
  updated_at: string | null;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, "Content-Type": "application/json", ...init?.headers },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(body?.message ?? `Request failed (${res.status})`);
  return body as T;
}

// numeric columns arrive as strings
const normalize = (p: Player): Player => ({
  ...p,
  start_sol: p.start_sol === null ? null : Number(p.start_sol),
  equity_sol: p.equity_sol === null ? null : Number(p.equity_sol),
  return_pct: p.return_pct === null ? null : Number(p.return_pct),
});

/** Create the player, or log in if the name already exists. */
export async function joinPlayer(username: string): Promise<Player> {
  const p = await call<Player>("rpc/join_player", { method: "POST", body: JSON.stringify({ p_username: username }) });
  return normalize(p);
}

export interface ScoreReport {
  username: string;
  runStartedAt: number; // ms
  startSol: number;
  equitySol: number;
  closedTrades: number;
  wins: number;
}

export async function submitScore(s: ScoreReport): Promise<void> {
  await call("rpc/submit_score", {
    method: "POST",
    body: JSON.stringify({
      p_username: s.username,
      p_run_started_at: new Date(s.runStartedAt).toISOString(),
      p_start_sol: s.startSol,
      p_equity_sol: s.equitySol,
      p_closed_trades: s.closedTrades,
      p_wins: s.wins,
    }),
  });
}

/** Everyone who has reported a run, best return first. */
export async function fetchPlayers(): Promise<Player[]> {
  const rows = await call<Player[]>(
    "players?select=*&return_pct=not.is.null&order=return_pct.desc&limit=200",
  );
  return rows.map(normalize);
}

// ---------- shared (multiplayer) coins ----------

export interface SharedCoinRow {
  id: string;
  name: string;
  ticker: string;
  hue: number;
  socials: { x: boolean; tg: boolean; web: boolean };
  creator: string;
  created_at: string;
  phase: "curve" | "graduated";
  r_sol: number;
  r_tok: number;
  tokens_sold: number;
  real_sol: number;
  crowd_tokens: number;
  rugged_at: string | null;
  last_trade_at: string;
  ath_mcap_sol: number;
  volume_sol: number;
  buys: number;
  sells: number;
}

export interface SharedTradeRow {
  id: number;
  coin_id: string;
  at: string;
  username: string | null; // null = simulated crowd
  side: "buy" | "sell";
  sol: number;
  tokens: number;
  mcap_sol: number;
}

export interface SharedHoldingRow {
  coin_id: string;
  username: string;
  tokens: number;
  cost_sol: number;
}

const post = (body: object) => ({ method: "POST", body: JSON.stringify(body), headers: { Prefer: "return=representation" } });

/** Recent public coins, with the simulated crowd caught up to now. */
export const fetchSharedMarket = () => call<SharedCoinRow[]>("rpc/shared_market", post({}));

/** Trades after `sinceId`; with no id yet, the latest 2000. Oldest first. */
export async function fetchSharedTrades(sinceId: number | null): Promise<SharedTradeRow[]> {
  if (sinceId === null) {
    const rows = await call<SharedTradeRow[]>("shared_trades?select=*&order=id.desc&limit=2000");
    return rows.reverse();
  }
  return call<SharedTradeRow[]>(`shared_trades?select=*&id=gt.${sinceId}&order=id.asc&limit=2000`);
}

export function fetchSharedHoldings(coinIds: string[]): Promise<SharedHoldingRow[]> {
  if (!coinIds.length) return Promise.resolve([]);
  return call<SharedHoldingRow[]>(`shared_holdings?select=*&tokens=gt.0&coin_id=in.(${coinIds.join(",")})`);
}

export const launchShared = (p: {
  username: string; name: string; ticker: string; hue: number; socials: object; devBuySol: number;
}) =>
  call<{ id: string; tokens: number; sol: number; mcap_sol: number }>("rpc/launch_shared", post({
    p_username: p.username, p_name: p.name, p_ticker: p.ticker, p_hue: p.hue, p_socials: p.socials, p_dev_buy_sol: p.devBuySol,
  }));

export const tradeShared = (username: string, coin: string, side: "buy" | "sell", amount: number, minOut: number) =>
  call<{ tokens: number; sol: number; fee: number; mcap_sol: number; rug: boolean }>("rpc/trade_shared", post({
    p_username: username, p_coin: coin, p_side: side, p_amount: amount, p_min_out: minOut,
  }));

export const hypeShared = (username: string, coin: string, buyers: number) =>
  call<null>("rpc/hype_shared", post({ p_username: username, p_coin: coin, p_buyers: buyers }));
