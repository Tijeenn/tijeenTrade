import { age, mc, pct, signed, sol } from "./format";
import type { TradeSummary } from "./portfolio";

export const CARD_W = 1200;
export const CARD_H = 630;
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

function solIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const g = ctx.createLinearGradient(x, y + size, x + size, y);
  g.addColorStop(0, "#9945FF");
  g.addColorStop(1, "#14F195");
  ctx.fillStyle = g;
  const s = size / 24;
  const bars = [
    [6, 3, 23, 3, 18, 8, 1, 8],
    [1, 9.5, 18, 9.5, 23, 14.5, 6, 14.5],
    [6, 16, 23, 16, 18, 21, 1, 21],
  ];
  for (const b of bars) {
    ctx.beginPath();
    ctx.moveTo(x + b[0] * s, y + b[1] * s);
    for (let i = 2; i < 8; i += 2) ctx.lineTo(x + b[i] * s, y + b[i + 1] * s);
    ctx.closePath();
    ctx.fill();
  }
}

/** Text with a SOL icon in front; returns the width used. */
function solText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  const color = ctx.fillStyle; // the icon swaps in its gradient; the text keeps its own color
  solIcon(ctx, x, y - size * 0.82, size * 0.8);
  ctx.fillStyle = color;
  ctx.fillText(text, x + size * 0.95, y);
  return size * 0.95 + ctx.measureText(text).width;
}

/** Draw a flex-ready PnL card for one trade. */
export function drawPnlCard(canvas: HTMLCanvasElement, t: TradeSummary, user: string) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  const win = t.pnlSol >= 0;
  const accent = win ? "#1fe3a0" : "#ff4b6b";

  // background + glow
  ctx.fillStyle = "#07080b";
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const glow = ctx.createRadialGradient(CARD_W * 0.85, CARD_H * 0.15, 20, CARD_W * 0.85, CARD_H * 0.15, 700);
  glow.addColorStop(0, win ? "rgba(31,227,160,0.28)" : "rgba(255,75,107,0.28)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, CARD_W - 2, CARD_H - 2);

  // brand
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 34px ${FONT}`;
  ctx.fillStyle = "#e7e9ee";
  ctx.fillText("tijeen", 64, 88);
  const w1 = ctx.measureText("tijeen").width;
  ctx.fillStyle = "#7b6cff";
  ctx.fillText(".trade", 64 + w1, 88);
  const brandW = w1 + ctx.measureText(".trade").width;
  ctx.font = `600 22px ${FONT}`;
  ctx.fillStyle = "#7d8394";
  ctx.fillText("@" + user, 64 + brandW + 24, 86);
  ctx.font = `600 16px ${FONT}`;
  ctx.fillStyle = "#f5b942";
  ctx.fillText("SIMULATED TRADE", CARD_W - 64 - ctx.measureText("SIMULATED TRADE").width, 84);

  // token
  const ax = 64, ay = 130, as = 76;
  const g = ctx.createLinearGradient(ax, ay, ax + as, ay + as);
  g.addColorStop(0, `hsl(${t.hue} 70% 45%)`);
  g.addColorStop(1, `hsl(${(t.hue + 50) % 360} 75% 25%)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(ax, ay, as, as, 14);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `800 26px ${FONT}`;
  const abbr = t.ticker.slice(0, 3);
  ctx.fillText(abbr, ax + (as - ctx.measureText(abbr).width) / 2, ay + as / 2 + 9);
  ctx.font = `800 44px ${FONT}`;
  ctx.fillStyle = "#e7e9ee";
  ctx.fillText("$" + t.ticker, ax + as + 24, ay + 44);
  ctx.font = `500 22px ${FONT}`;
  ctx.fillStyle = "#7d8394";
  ctx.fillText(t.name + (t.open ? " · still holding" : ""), ax + as + 24, ay + 76);

  // the number
  ctx.font = `900 150px ${FONT}`;
  ctx.fillStyle = accent;
  ctx.fillText(signed(t.pnlPct, (x) => pct(x, 1)), 58, 380);
  ctx.font = `700 46px ${FONT}`;
  solText(ctx, signed(t.pnlSol, (x) => sol(x)), 64, 446, 46);

  // details
  const cols: [string, string, boolean][] = [
    ["Bought", sol(t.boughtSol), true],
    ["Sold", sol(t.soldSol), true],
    ["Entry MC", mc(t.entryMcUsd), true],
    ["Exit MC", t.exitMcUsd ? mc(t.exitMcUsd) : "–", !!t.exitMcUsd],
    ["Held", age(t.heldMs), false],
  ];
  let x = 64;
  for (const [label, value, isSol] of cols) {
    ctx.font = `600 18px ${FONT}`;
    ctx.fillStyle = "#535869";
    ctx.fillText(label.toUpperCase(), x, 520);
    ctx.font = `700 30px ${FONT}`;
    ctx.fillStyle = "#e7e9ee";
    if (isSol) solText(ctx, value, x, 560, 30);
    else ctx.fillText(value, x, 560);
    x += 214;
  }

}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = filename;
  a.click();
}

/** Copy the card as an image, where the browser allows it. */
export async function copyCanvas(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob) return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}
