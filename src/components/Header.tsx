"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signed, sol } from "@/lib/format";
import { useMarket, useMounted } from "@/lib/store";
import { AccountButton } from "./account/AccountButton";
import { SocialButton } from "./social/SocialButton";
import { Sol } from "./Sol";

const NAV = [
  { href: "/", label: "Pulse", short: "Pulse" },
  { href: "/portfolio", label: "Portfolio", short: "Folio" },
  { href: "/leaderboard", label: "Leaderboard", short: "Ranks" },
  { href: "/create", label: "+ Create", short: "+" },
  { href: "/settings", label: "Settings", short: "⚙" },
];

function Balance() {
  const m = useMarket(500);
  const equity = m.equity();
  const pnl = equity - m.startSol;
  return (
    <div className="num flex items-center gap-3 text-sm">
      <div className="hidden text-right sm:block">
        <div className="text-[10px] uppercase tracking-wide text-dim">Equity</div>
        <div className={pnl >= 0 ? "text-up" : "text-down"}>
          <Sol>{sol(equity)} <span className="text-xs">({signed(pnl, (x) => sol(x))})</span></Sol>
        </div>
      </div>
      <div className="rounded-md border border-line-2 bg-panel-2 px-2 py-1.5 font-medium sm:px-3">
        <Sol size={14}>{sol(m.sol)}</Sol>
      </div>
    </div>
  );
}

export function Header() {
  const path = usePathname();
  const mounted = useMounted();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-line bg-bg/95 px-3 backdrop-blur sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-6">
        <Link href="/" className="text-base font-bold tracking-tight sm:text-lg">
          tijeen<span className="text-brand">.trade</span>
        </Link>
        <nav className="flex text-[13px] sm:gap-1 sm:text-sm">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-md px-2 py-1.5 sm:px-3 ${path === n.href ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
            >
              <span className="sm:hidden">{n.short}</span>
              <span className="hidden sm:inline">{n.label}</span>
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden rounded border border-warn/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warn md:inline">
          Simulation · not real money
        </span>
        {mounted && <Balance />}
        {mounted && <SocialButton />}
        {mounted && <AccountButton />}
      </div>
    </header>
  );
}
