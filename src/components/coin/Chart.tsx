"use client";

import {
  CandlestickSeries, ColorType, createChart, createSeriesMarkers, HistogramSeries,
  type IChartApi, type ISeriesApi, type ISeriesMarkersPluginApi, type SeriesMarker, type Time, type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { usd } from "@/lib/format";
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

interface Bar {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Group the coin's 1s (or 1m) candles into bars of `tf` seconds, on the wall clock. */
function aggregate(c: Coin, tf: number): Bar[] {
  const src = tf < 60 ? c.candles : c.candles1m;
  const epoch = wallMs(0) / 1000;
  const out: Bar[] = [];
  for (const k of src) {
    const t = (Math.floor((epoch + k.t) / tf) * tf) as UTCTimestamp;
    const last = out[out.length - 1];
    if (last && last.time === t) {
      last.high = Math.max(last.high, k.h);
      last.low = Math.min(last.low, k.l);
      last.close = k.c;
      last.volume += k.v;
    } else {
      out.push({ time: t, open: k.o, high: k.h, low: k.l, close: k.c, volume: k.v });
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
      priceFormat: { type: "custom", formatter: (p: number) => usd(p, 2), minMove: 1 },
    });
    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: "", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false,
    });
    chart.priceScale("").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    api.current = { chart, candles, volume, markers: createSeriesMarkers(candles, []), key: "", lastT: 0, markerCount: -1 };
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
      const markers: SeriesMarker<Time>[] = mine.map((h) => ({
        time: (Math.floor((epoch + h.t / 1000) / tf) * tf) as UTCTimestamp,
        position: h.side === "buy" ? "belowBar" : "aboveBar",
        shape: h.side === "buy" ? "arrowUp" : "arrowDown",
        color: h.side === "buy" ? UP : DOWN,
        text: h.side === "buy" ? "B" : "S",
      }));
      a.markers.setMarkers(markers);
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
        <span className="ml-auto text-[11px] text-dim">Market cap (USD)</span>
      </div>
      <div ref={el} className="min-h-0 flex-1" />
    </div>
  );
}
