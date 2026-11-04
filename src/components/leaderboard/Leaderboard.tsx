"use client";

import { useCallback, useEffect, useState } from "react";
import { LoginDialog } from "@/components/account/LoginDialog";
import { Sol } from "@/components/Sol";
import { syncScore, useUsername } from "@/lib/account";
import { age, pct, signed, sol } from "@/lib/format";
import { fetchPlayers, MIN_TRADES_TO_RANK, type Player } from "@/lib/supabase";

const REFRESH_MS = 15_000;
const tone = (n: number) => (n > 0 ? "text-up" : n < 0 ? "text-down" : "text-text");
const ret = (p: Player) => signed(p.return_pct ?? 0, (x) => pct(x, 1));
const medal = ["🥇", "🥈", "🥉"];

function Row({ p, rank, me, now }: { p: Player; rank?: number; me: boolean; now: number }) {
  const wr = p.closed_trades ? (p.wins / p.closed_trades) * 100 : 0;
  return (
    <tr className={`border-t border-line ${me ? "bg-brand/10" : ""}`}>
      <td className="px-3 py-2.5 text-center text-dim">{rank === undefined ? "–" : medal[rank - 1] ?? rank}</td>
      <td className="px-3 font-semibold">
        {p.username}
        {me && <span className="ml-2 rounded bg-brand/25 px-1 text-[10px] text-brand">YOU</span>}
      </td>
      <td className={`px-3 font-semibold ${tone(p.return_pct ?? 0)}`}>{ret(p)}</td>
      <td className="px-3"><Sol>{sol(p.equity_sol ?? 0)}</Sol></td>
      <td className="hidden px-3 text-muted sm:table-cell"><Sol>{sol(p.start_sol ?? 0)}</Sol></td>
      <td className="px-3 text-muted">{p.closed_trades}</td>
      <td className="hidden px-3 text-muted sm:table-cell">{p.closed_trades ? pct(wr) : "–"}</td>
      <td className="hidden px-3 text-dim md:table-cell">{p.updated_at ? age(now - Date.parse(p.updated_at)) + " ago" : "–"}</td>
    </tr>
  );
}

function Table({ players, me, now, ranked }: { players: Player[]; me: string | null; now: number; ranked: boolean }) {
  const isMe = (p: Player) => !!me && p.username.toLowerCase() === me.toLowerCase();
  return (
    <table className="num w-full text-sm">
      <thead className="text-left text-xs text-dim">
        <tr>
          <th className="w-12 px-3 py-2 text-center font-normal">#</th>
          <th className="px-3 font-normal">Player</th>
          <th className="px-3 font-normal">Return</th>
          <th className="px-3 font-normal">Equity</th>
          <th className="hidden px-3 font-normal sm:table-cell">Started with</th>
          <th className="px-3 font-normal">Trades</th>
          <th className="hidden px-3 font-normal sm:table-cell">Win rate</th>
          <th className="hidden px-3 font-normal md:table-cell">Active</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p, i) => (
          <Row key={p.username} p={p} rank={ranked ? i + 1 : undefined} me={isMe(p)} now={now} />
        ))}
      </tbody>
    </table>
  );
}

export function Leaderboard() {
  const me = useUsername();
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [now, setNow] = useState(0);
  const [error, setError] = useState<string>();
  const [login, setLogin] = useState(false);

  const load = useCallback(async () => {
    try {
      await syncScore().catch(() => {});
      setPlayers(await fetchPlayers());
      setNow(Date.now());
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the leaderboard");
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load, me]);

  const ranked = (players ?? []).filter((p) => p.closed_trades >= MIN_TRADES_TO_RANK);
  const unranked = (players ?? []).filter((p) => p.closed_trades < MIN_TRADES_TO_RANK);
  const myIdx = me ? ranked.findIndex((p) => p.username.toLowerCase() === me.toLowerCase()) : -1;
  const mine = me ? players?.find((p) => p.username.toLowerCase() === me.toLowerCase()) : undefined;

  return (
    <div className="mx-auto w-full max-w-5xl p-4">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-bold">Leaderboard</h1>
        <span className="text-xs text-dim">Ranked by % return on the current run</span>
      </div>

      <div className="mb-4 rounded-lg border border-line bg-panel p-4 text-sm">
        {!me ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-muted">Log in with a username to get on the board.</span>
            <button onClick={() => setLogin(true)} className="rounded-md bg-brand px-4 py-2 font-semibold text-white">
              Log in
            </button>
          </div>
        ) : myIdx >= 0 ? (
          <span>
            You&apos;re <b className="text-brand">#{myIdx + 1}</b> of {ranked.length} with{" "}
            <b className={tone(ranked[myIdx].return_pct ?? 0)}>{ret(ranked[myIdx])}</b>.
          </span>
        ) : (
          <span className="text-muted">
            Close <b className="text-text">{MIN_TRADES_TO_RANK - (mine?.closed_trades ?? 0)}</b> more trade
            {MIN_TRADES_TO_RANK - (mine?.closed_trades ?? 0) === 1 ? "" : "s"} to get ranked. Only fully sold positions count.
          </span>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-down">{error}</p>}
      {!players && !error && <p className="p-8 text-center text-sm text-dim">Loading…</p>}

      {players && (
        <div className="overflow-hidden rounded-lg border border-line bg-panel">
          {ranked.length ? (
            <Table players={ranked} me={me} now={now} ranked />
          ) : (
            <p className="p-8 text-center text-sm text-dim">Nobody is ranked yet. Be the first!</p>
          )}
        </div>
      )}

      {unranked.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 text-sm font-semibold text-muted">
            Warming up <span className="font-normal text-dim">· fewer than {MIN_TRADES_TO_RANK} closed trades</span>
          </h2>
          <div className="overflow-hidden rounded-lg border border-line bg-panel opacity-80">
            <Table players={unranked} me={me} now={now} ranked={false} />
          </div>
        </>
      )}
      {login && <LoginDialog onClose={() => setLogin(false)} />}
    </div>
  );
}
