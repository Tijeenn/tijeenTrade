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
