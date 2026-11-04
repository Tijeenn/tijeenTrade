"use client";

import {
  CandlestickSeries, ColorType, createChart, createSeriesMarkers, HistogramSeries, LineStyle,
  type IChartApi, type IPriceLine, type ISeriesApi, type ISeriesMarkersPluginApi, type SeriesMarker, type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { compact, pct, signed, sol, usdToSol } from "@/lib/format";
import { avgEntry } from "@/lib/portfolio";
import type { Coin, Market } from "@/lib/sim/market";
import { wallMs } from "@/lib/store";

const TIMEFRAMES = [
  { label: "1s", sec: 1 },
  { label: "15s", sec: 15 },
  { label: "1m", sec: 60 },
  { label: "5m", sec: 300 },
  { label: "15m", sec: 900 },
];

const UP = "#1fe3a0";
const DOWN = "#ff4b6b";
const BRAND = "#7b6cff";

interface Bar {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Group the coin's 1s (or 1m) candles into bars of `tf` seconds, on the wall clock, in SOL. */
function aggregate(c: Coin, tf: number): Bar[] {
  const src = tf < 60 ? c.candles : c.candles1m;
  const epoch = wallMs(0) / 1000;
  const out: Bar[] = [];
  for (const k of src) {
    const t = (Math.floor((epoch + k.t) / tf) * tf) as UTCTimestamp;
    const last = out[out.length - 1];
    if (last && last.time === t) {
      last.high = Math.max(last.high, usdToSol(k.h));
      last.low = Math.min(last.low, usdToSol(k.l));
      last.close = usdToSol(k.c);
      last.volume += k.v;
    } else {
      const [o, h, l, c] = [k.o, k.h, k.l, k.c].map(usdToSol);
      out.push({ time: t, open: o, high: h, low: l, close: c, volume: k.v });
    }
  }
  return out;
}

const clock = (t: number) =>
  new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function Chart({ coin, m }: { coin: Coin; m: Market }) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<{
    chart: IChartApi;
    candles: ISeriesApi<"Candlestick">;
    volume: ISeriesApi<"Histogram">;
    markers: ISeriesMarkersPluginApi<Time>;
    key: string;
    lastT: number;
    markerCount: number;
    entryLine: IPriceLine | null;
  } | null>(null);
  const [tf, setTf] = useState(1);

  useEffect(() => {
    const chart = createChart(el.current!, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#0e1015" }, textColor: "#7d8394", fontSize: 11 },
      grid: { vertLines: { color: "#161922" }, horzLines: { color: "#161922" } },
      rightPriceScale: { borderColor: "#1c202b" },
      timeScale: { borderColor: "#1c202b", timeVisible: true, secondsVisible: true, tickMarkFormatter: clock },
      localization: { timeFormatter: clock },
      crosshair: { mode: 0 },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN,
      priceFormat: { type: "custom", formatter: (p: number) => compact(p, 2), minMove: 0.01 },
    });
    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: "", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false,
    });
    chart.priceScale("").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    api.current = { chart, candles, volume, markers: createSeriesMarkers(candles, []), key: "", lastT: 0, markerCount: -1, entryLine: null };
    return () => {
      chart.remove();
      api.current = null;
    };
  }, []);

  // Runs on every market tick: push new/changed bars only.
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    const bars = aggregate(coin, tf);
    const vol = (b: Bar) => ({ time: b.time, value: b.volume, color: b.close >= b.open ? UP + "55" : DOWN + "55" });
    const key = coin.id + ":" + tf;
    if (a.key !== key) {
      a.candles.setData(bars);
      a.volume.setData(bars.map(vol));
      a.chart.timeScale().scrollToRealTime();
      a.key = key;
      a.markerCount = -1;
    } else {
      for (let i = Math.max(0, bars.length - 5); i < bars.length; i++) {
        if (bars[i].time < a.lastT) continue;
        a.candles.update(bars[i]);
        a.volume.update(vol(bars[i]));
      }
    }
    a.lastT = bars.at(-1)?.time ?? 0;

    const mine = m.history.filter((h) => h.coinId === coin.id && h.status === "ok");
    if (mine.length !== a.markerCount) {
      a.markerCount = mine.length;
      const epoch = wallMs(0) / 1000;
      // Buys: green arrow under the candle. Sells: arrow above, coloured by whether you made money.
      const markers: SeriesMarker<Time>[] = mine.map((h) => {
        const time = (Math.floor((epoch + h.t / 1000) / tf) * tf) as UTCTimestamp;
        if (h.side === "buy") {
          return { time, position: "belowBar", shape: "arrowUp", color: UP, size: 2, text: `BUY ${sol(h.sol)}` };
        }
        const pnl = h.pnlSol ?? 0;
        return {
          time, position: "aboveBar", shape: "arrowDown", color: pnl >= 0 ? UP : DOWN, size: 2,
          text: `SELL ${signed(h.pnlPct ?? 0, (x) => pct(x, 0))}`,
        };
      });
      a.markers.setMarkers(markers);
    }

    // Dashed line at your average entry while you hold the coin.
    const holding = (m.positions.get(coin.id)?.tokens ?? 0) > 0;
    const entry = holding ? usdToSol(avgEntry(m, coin.id)) : 0;
    if (entry > 0) {
      const opts = { price: entry, color: BRAND, lineWidth: 1 as const, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Avg entry" };
      if (a.entryLine) a.entryLine.applyOptions(opts);
      else a.entryLine = a.candles.createPriceLine(opts);
    } else if (a.entryLine) {
      a.candles.removePriceLine(a.entryLine);
      a.entryLine = null;
    }
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2">
        {TIMEFRAMES.map((t) => (
          <button
            key={t.sec}
            onClick={() => setTf(t.sec)}
            className={`rounded px-2 py-1 text-xs ${tf === t.sec ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-dim">Market cap (SOL)</span>
      </div>
      <div ref={el} className="min-h-0 flex-1" />
    </div>
  );
}
