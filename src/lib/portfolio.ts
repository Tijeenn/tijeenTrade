import type { Market, Position } from "./sim/market";

export interface OpenRow {
  pos: Position;
  value: number;
  unrealized: number;
  pnl: number; // realized + unrealized on this coin
  pnlPct: number;
  avgEntryMcapUsd: number;
}

export interface PortfolioStats {
  equity: number;
  pnl: number;
  pnlPct: number;
  realized: number;
  unrealized: number;
  fees: number;
  trades: number;
  winRate: number; // over closed positions, 0..1
  best?: Position;
  worst?: Position;
  open: OpenRow[];
  closed: Position[];
}

/** Average market cap you bought at, weighted by tokens. */
function avgEntry(m: Market, coinId: string): number {
  let w = 0, t = 0;
  for (const h of m.history) {
    if (h.coinId !== coinId || h.side !== "buy" || h.status !== "ok") continue;
    w += h.mcapUsd * h.tokens;
    t += h.tokens;
  }
  return t ? w / t : 0;
}

export function portfolioStats(m: Market): PortfolioStats {
  const open: OpenRow[] = [];
  const closed: Position[] = [];
  let realized = 0;
  let unrealized = 0;
  for (const pos of m.positions.values()) {
    realized += pos.realizedSol;
    if (pos.tokens > 0) {
      const value = m.positionValue(pos.coinId);
      const u = value - pos.costSol;
      unrealized += u;
      const pnl = pos.realizedSol + u;
      open.push({
        pos, value, unrealized: u, pnl,
        pnlPct: pos.boughtSol ? (pnl / pos.boughtSol) * 100 : 0,
        avgEntryMcapUsd: avgEntry(m, pos.coinId),
      });
    } else if (pos.boughtSol > 0) {
      closed.push(pos);
    }
  }
  const ok = m.history.filter((h) => h.status === "ok");
  const fees = m.history.reduce((s, h) => s + h.fee + h.priorityFee, 0);
  const byPnl = [...closed].sort((a, b) => b.realizedSol - a.realizedSol);
  const equity = m.equity();
  return {
    equity,
    pnl: equity - m.startSol,
    pnlPct: ((equity - m.startSol) / m.startSol) * 100,
    realized,
    unrealized,
    fees,
    trades: ok.length,
    winRate: closed.length ? closed.filter((p) => p.realizedSol > 0).length / closed.length : 0,
    best: byPnl[0],
    worst: byPnl.at(-1),
    open: open.sort((a, b) => b.value - a.value),
    closed: closed.reverse(), // newest first (insertion order = first buy)
  };
}
