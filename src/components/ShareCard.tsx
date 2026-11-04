"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUsername } from "@/lib/account";
import { copyCanvas, downloadCanvas, drawPnlCard } from "@/lib/pnlCard";
import { tradeSummary } from "@/lib/portfolio";
import { getMarket } from "@/lib/store";

function ShareModal({ coinId, onClose }: { coinId: string; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const user = useUsername() ?? "anon";
  const [summary] = useState(() => tradeSummary(getMarket(), coinId));
  const [copied, setCopied] = useState<string>();

  useEffect(() => {
    if (canvas.current && summary) drawPnlCard(canvas.current, summary, user);
  }, [summary, user]);

  if (!summary) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-lg border border-line-2 bg-panel p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Share your PnL</h2>
          <button onClick={onClose} className="text-lg text-muted hover:text-text" aria-label="Close">✕</button>
        </div>
        <canvas ref={canvas} className="aspect-[1200/630] w-full rounded-md" />
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {copied && <span className="self-center text-xs text-muted">{copied}</span>}
          <button
            onClick={async () => setCopied((await copyCanvas(canvas.current!)) ? "Copied!" : "Your browser can't copy images, use Download")}
            className="rounded-md border border-line-2 px-3 py-2 text-sm hover:border-brand"
          >
            Copy image
          </button>
          <button
            onClick={() => downloadCanvas(canvas.current!, `tijeen-${summary.ticker}-pnl.png`)}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Download PNG
          </button>
        </div>
      </div>
    </div>
  );
}

/** Button that opens a flex-ready PnL card for a trade. */
export function ShareButton({ coinId, className = "", label = "📸 Share" }: { coinId: string; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={`rounded border border-line-2 px-2 py-0.5 text-xs text-muted hover:border-brand hover:text-text ${className}`}
      >
        {label}
      </button>
      {open && createPortal(<ShareModal coinId={coinId} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
