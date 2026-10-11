"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";

// Daily columns: one column per day. "up" series stack above the baseline, "down" series
// below it (e.g. opt-ins vs opt-outs). Follows the data-viz spec: ≤24px columns with 4px
// rounded data-ends, a 2px surface gap between stacked segments, hairline grid, a legend
// for 2+ series, a whole-day hover/focus target with one tooltip for every series, and a
// table view so no value depends on hovering.

export type ColumnSeries = { key: string; label: string; color: string; direction?: "up" | "down" };
type Row = { day: string } & Record<string, number | string>;

const HEIGHT = 220;
const MARGIN = { top: 10, right: 8, bottom: 26, left: 40 };
const GAP = 2;
const RADIUS = 4;
const MAX_COL = 24;

export function DailyColumns({ data, series, label }: { data: Row[]; series: ColumnSeries[]; label: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const up = series.filter((s) => s.direction !== "down");
  const down = series.filter((s) => s.direction === "down");
  const value = (row: Row, key: string) => Number(row[key]) || 0;
  const maxUp = Math.max(0, ...data.map((r) => up.reduce((sum, s) => sum + value(r, s.key), 0)));
  const maxDown = Math.max(0, ...data.map((r) => down.reduce((sum, s) => sum + value(r, s.key), 0)));
  const step = niceStep(Math.max(maxUp, maxDown, 1));
  const top = Math.max(step, Math.ceil(maxUp / step) * step);
  const bottom = down.length ? Math.max(step, Math.ceil(maxDown / step) * step) : 0;

  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const y = (v: number) => MARGIN.top + ((top - v) / (top + bottom)) * plotH;
  const band = data.length ? plotW / data.length : 0;
  const colW = Math.max(1, Math.min(MAX_COL, band * 0.7));
  const ticks: number[] = [];
  for (let v = -bottom; v <= top + 1e-9; v += step) ticks.push(v);
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 70))));

  function onKeyDown(e: KeyboardEvent) {
    if (!data.length) return;
    if (e.key === "ArrowRight") setActive((a) => Math.min(data.length - 1, (a ?? -1) + 1));
    else if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? data.length) - 1));
    else return;
    e.preventDefault();
  }

  const activeRow = active !== null ? data[active] : null;
  const tooltipLeft = active !== null ? Math.min(Math.max(MARGIN.left + band * (active + 0.5), 80), width - 80) : 0;

  return (
    <figure className="viz-root">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {series.length > 1 ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--viz-ink-2)]">
            {series.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
                {s.label}
                {s.direction === "down" && <span className="text-[color:var(--viz-muted)]">(below the line)</span>}
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
        <button className="text-xs text-slate-500 underline hover:text-slate-800" onClick={() => setShowTable((t) => !t)}>
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>

      {showTable ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-left text-sm tabular-nums">
            <thead className="sticky top-0 bg-white text-xs text-slate-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Day</th>
                {series.map((s) => (
                  <th key={s.key} className="py-1 pr-3 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.day} className="border-t border-slate-100">
                  <td className="py-1 pr-3">{formatDay(r.day, true)}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-1 pr-3 text-right">
                      {value(r, s.key).toLocaleString()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={boxRef} className="relative" style={{ height: HEIGHT }}>
          {width > 0 && (
            <svg
              width={width}
              height={HEIGHT}
              role="group"
              aria-label={`${label}. Use the left and right arrow keys to read each day.`}
              tabIndex={0}
              className="outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              onKeyDown={onKeyDown}
              onFocus={() => setActive((a) => a ?? data.length - 1)}
              onBlur={() => setActive(null)}
              onPointerLeave={() => setActive(null)}
            >
              {ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={MARGIN.left}
                    x2={width - MARGIN.right}
                    y1={Math.round(y(t)) + 0.5}
                    y2={Math.round(y(t)) + 0.5}
                    stroke={t === 0 ? "var(--viz-baseline)" : "var(--viz-grid)"}
                    strokeWidth={1}
                  />
                  <text x={MARGIN.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--viz-muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {Math.abs(t).toLocaleString()}
                  </text>
                </g>
              ))}

              {data.map((row, i) => {
                const cx = MARGIN.left + band * (i + 0.5);
                const dim = active !== null && active !== i;
                return (
                  <g key={row.day} opacity={dim ? 0.45 : 1}>
                    {stack(up, row, value, y, 1).map((seg) => (
                      <path key={seg.key} d={columnPath(cx - colW / 2, colW, seg.y0, seg.y1, seg.rounded)} fill={seg.color} />
                    ))}
                    {stack(down, row, value, y, -1).map((seg) => (
                      <path key={seg.key} d={columnPath(cx - colW / 2, colW, seg.y0, seg.y1, seg.rounded)} fill={seg.color} />
                    ))}
                    {i % labelEvery === 0 && (
                      <text x={cx} y={HEIGHT - 8} textAnchor="middle" fontSize={11} fill="var(--viz-muted)">
                        {formatDay(row.day)}
                      </text>
                    )}
                    {/* Hit target: the whole day, taller and wider than the column. */}
                    <rect
                      x={MARGIN.left + band * i}
                      y={MARGIN.top}
                      width={band}
                      height={plotH}
                      fill="transparent"
                      onPointerEnter={() => setActive(i)}
                    />
                  </g>
                );
              })}
            </svg>
          )}

          {activeRow && (
            <div
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md"
              style={{ left: tooltipLeft }}
              role="status"
            >
              <div className="mb-1 text-[color:var(--viz-muted)]">{formatDay(activeRow.day, true)}</div>
              {series.map((s) => (
                <div key={s.key} className="flex items-center gap-2 whitespace-nowrap">
                  <span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} aria-hidden />
                  <b className="tabular-nums text-[color:var(--viz-ink)]">{value(activeRow, s.key).toLocaleString()}</b>
                  <span className="text-[color:var(--viz-ink-2)]">{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

/** Segments of one column, outward from the baseline, with a 2px gap between them. */
function stack(
  series: ColumnSeries[],
  row: Row,
  value: (r: Row, k: string) => number,
  y: (v: number) => number,
  sign: 1 | -1,
) {
  const segments: { key: string; color: string; y0: number; y1: number; rounded: "top" | "bottom" | null }[] = [];
  let total = 0;
  const nonZero = series.filter((s) => value(row, s.key) > 0);
  nonZero.forEach((s, i) => {
    const start = total;
    total += value(row, s.key);
    let y0 = y(sign * start);
    const y1 = y(sign * total);
    if (i > 0) y0 -= sign * GAP; // surface gap from the previous segment
    if (sign * (y0 - y1) <= 0.5) return; // too small to draw; still in the tooltip and table
    const outermost = i === nonZero.length - 1;
    segments.push({ key: s.key, color: s.color, y0, y1, rounded: outermost ? (sign > 0 ? "top" : "bottom") : null });
  });
  return segments;
}

/** Rectangle from y0 (baseline side) to y1 (data end), rounding only the data end. */
function columnPath(x: number, w: number, y0: number, y1: number, rounded: "top" | "bottom" | null): string {
  const h = Math.abs(y0 - y1);
  const r = rounded ? Math.min(RADIUS, w / 2, h) : 0;
  const yTop = Math.min(y0, y1);
  const yBottom = Math.max(y0, y1);
  if (rounded === "top") {
    return `M${x},${yBottom}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + w - r}Q${x + w},${yTop} ${x + w},${yTop + r}V${yBottom}Z`;
  }
  if (rounded === "bottom") {
    return `M${x},${yTop}V${yBottom - r}Q${x},${yBottom} ${x + r},${yBottom}H${x + w - r}Q${x + w},${yBottom} ${x + w},${yBottom - r}V${yTop}Z`;
  }
  return `M${x},${yTop}H${x + w}V${yBottom}H${x}Z`;
}

/** A round step (1, 2, 5 × 10ⁿ) giving about 4 gridlines. */
function niceStep(max: number): number {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow);
}

function formatDay(day: string, long = false): string {
  const d = new Date(`${day}T00:00:00`);
  return d.toLocaleDateString([], long ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short" });
}
