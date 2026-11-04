import type { Coin } from "@/lib/sim/market";

/** Generated coin "image": a gradient + the ticker's first letters. */
export function TokenAvatar({ coin, size = 48 }: { coin: Pick<Coin, "hue" | "ticker">; size?: number }) {
  const h = coin.hue;
  return (
    <div
      className="flex shrink-0 select-none items-center justify-center rounded-md font-bold text-white/90"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.32,
        background: `linear-gradient(135deg, hsl(${h} 70% 45%), hsl(${(h + 50) % 360} 75% 25%))`,
        textShadow: "0 1px 2px rgb(0 0 0 / 0.5)",
      }}
    >
      {coin.ticker.slice(0, 3)}
    </div>
  );
}
