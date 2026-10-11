import { compactNumber, percent } from "@/lib/format";

export type FunnelStage = { label: string; value: number };

/**
 * Horizontal funnel: one series, so one color. Each bar is labeled at its tip with the
 * count and its share of the first stage, so nothing depends on hovering.
 */
export function Funnel({ stages, caption }: { stages: FunnelStage[]; caption?: string }) {
  const base = stages[0]?.value ?? 0;
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <figure className="viz-root">
      <ol className="space-y-2.5">
        {stages.map((s, i) => {
          const share = i === 0 ? null : percent(s.value, base);
          const width = (s.value / max) * 100;
          return (
            <li key={s.label} className="grid grid-cols-[6.5rem_1fr] items-center gap-3 text-sm">
              <span className="text-[color:var(--viz-ink-2)]">{s.label}</span>
              <div className="flex items-center gap-2" title={`${s.label}: ${s.value.toLocaleString()}${share ? ` (${share} of ${stages[0].label.toLowerCase()})` : ""}`}>
                <div
                  className="h-5 max-w-[calc(100%-7rem)] rounded-r bg-[var(--viz-series-1)]"
                  style={{ width: `${width}%`, minWidth: s.value ? 3 : 0 }}
                />
                <span className="whitespace-nowrap tabular-nums text-[color:var(--viz-ink)]">
                  <b className="font-semibold">{compactNumber(s.value)}</b>
                  {share && <span className="ml-1 text-[color:var(--viz-muted)]">{share}</span>}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      {caption && <figcaption className="mt-2 text-xs text-[color:var(--viz-muted)]">{caption}</figcaption>}
    </figure>
  );
}
