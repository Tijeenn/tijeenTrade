"use client";

import { AreaSeries, ColorType, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef } from "react";
import { compact } from "@/lib/format";
import type { Run } from "@/lib/store";

export function EquityChart({ run, startSol }: { run: Run; startSol: number }) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<{ chart: IChartApi; series: ISeriesApi<"Area">; count: number } | null>(null);

  useEffect(() => {
    const chart = createChart(el.current!, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#0e1015" }, textColor: "#7d8394", fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: "#161922" } },
      rightPriceScale: { borderColor: "#1c202b" },
      timeScale: { borderColor: "#1c202b", timeVisible: true },
      localization: { timeFormatter: (t: number) => new Date(t * 1000).toLocaleString() },
      handleScroll: false,
      handleScale: false,
    });
    const series = chart.addSeries(AreaSeries, {
      lineWidth: 2,
      priceFormat: { type: "custom", formatter: (p: number) => compact(p, 2), minMove: 0.001 },
    });
    api.current = { chart, series, count: -1 };
    return () => {
      chart.remove();
      api.current = null;
    };
  }, []);

  useEffect(() => {
    const a = api.current;
    if (!a || a.count === run.equity.length) return;
    a.count = run.equity.length;
    // one point per second at most, ascending
    const pts = new Map<number, number>();
    for (const [ms, v] of run.equity) pts.set(Math.floor(ms / 1000), v);
    const data = [...pts].sort((x, y) => x[0] - y[0]).map(([t, value]) => ({ time: t as UTCTimestamp, value }));
    const up = (data.at(-1)?.value ?? startSol) >= startSol;
    a.series.applyOptions({
      lineColor: up ? "#1fe3a0" : "#ff4b6b",
      topColor: up ? "#1fe3a033" : "#ff4b6b33",
      bottomColor: "#1fe3a000",
    });
    a.series.setData(data);
    a.chart.timeScale().fitContent();
  });

  return <div ref={el} className="h-full w-full" />;
}
