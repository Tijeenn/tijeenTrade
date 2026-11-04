"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signed, sol } from "@/lib/format";
import { useMarket, useMounted } from "@/lib/store";

const NAV = [{ href: "/", label: "Pulse" }];

function Balance() {
  const m = useMarket(500);
  const equity = m.equity();
  const pnl = equity - m.startSol;
  return (
    <div className="num flex items-center gap-3 text-sm">
      <div className="hidden text-right sm:block">
        <div className="text-[10px] uppercase tracking-wide text-dim">Equity</div>
        <div className={pnl >= 0 ? "text-up" : "text-down"}>
          {sol(equity)} SOL <span className="text-xs">({signed(pnl, (x) => sol(x))})</span>
        </div>
      </div>
      <div className="rounded-md border border-line-2 bg-panel-2 px-3 py-1.5 font-medium">
        <span className="text-brand">◎</span> {sol(m.sol)}
      </div>
    </div>
  );
}

export function Header() {
  const path = usePathname();
  const mounted = useMounted();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/95 px-4 backdrop-blur">
      <div className="flex items-center gap-6">
        <Link href="/" className="text-lg font-bold tracking-tight">
          tijeen<span className="text-brand">.trade</span>
        </Link>
        <nav className="flex gap-1 text-sm">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-md px-3 py-1.5 ${path === n.href ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden rounded border border-warn/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warn md:inline">
          Simulation · not real money
        </span>
        {mounted && <Balance />}
      </div>
    </header>
  );
}
