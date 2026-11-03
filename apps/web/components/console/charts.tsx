import { cumulative, donutSlices, niceMax, percents } from "@/lib/chart";
import type { Point } from "@/lib/dashboard";

// Charts for the staff dashboard, drawn as plain SVG and HTML: no chart library, no client JavaScript. After Regalwa's
// dashboard they come in three kinds: bars on a track (with an optional running-total line), a donut with a labelled
// legend, and labelled progress bars. Every chart also carries its numbers as a hidden table, for screen readers.

function DataTable({ caption, rows }: { caption: string; rows: [string, number | string][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row">{k}</th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Bars on a pale track. `line` adds the running total as a thin amber line over them. */
export function BarChart({ data, caption, line = false, lineLabel = "Running total" }: { data: Point[]; caption: string; line?: boolean; lineLabel?: string }) {
  const top = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const running = cumulative(data.map((d) => d.value));
  const sum = running.at(-1) ?? 0;
  const runTop = Math.max(1, sum);
  const step = data.length > 8 ? 2 : 1;
  const n = data.length || 1;

  return (
    <figure className="mt-5">
      <div className="relative h-44 pl-7">
        {[1, 0.5, 0].map((f) => (
          <div key={f} aria-hidden="true" className="absolute inset-x-0 flex items-center" style={{ bottom: `${f * 100}%`, transform: "translateY(50%)" }}>
            <span className="w-6 text-[11px] text-muted tabular-nums">{Math.round(top * f)}</span>
            <span className="h-px flex-1 bg-hairline" />
          </div>
        ))}
        <div className="absolute inset-y-0 right-0 left-7 flex items-end gap-1.5">
          {data.map((d) => (
            <div key={d.label} title={`${d.label}: ${d.value}`} className="relative h-full flex-1 rounded-t-md bg-canvas">
              {d.value > 0 && <div className="absolute inset-x-0 bottom-0 rounded-t-md bg-indigo" style={{ height: `${Math.max(3, (d.value / top) * 100)}%` }} />}
            </div>
          ))}
        </div>
        {line && sum > 0 && (
          <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-y-0 right-0 left-7 h-full w-[calc(100%-1.75rem)] overflow-visible">
            <polyline
              fill="none"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="stroke-streetlight"
              points={running.map((v, i) => `${(((i + 0.5) / n) * 100).toFixed(2)},${(100 - (v / runTop) * 100).toFixed(2)}`).join(" ")}
            />
          </svg>
        )}
      </div>
      <div aria-hidden="true" className="mt-1.5 flex gap-1.5 pl-7 text-[11px] text-muted tabular-nums">
        {data.map((d, i) => (
          <span key={d.label} className="min-w-0 flex-1 truncate text-center">
            {i % step === 0 ? (data.length > 8 ? d.label.split(" ")[0] : d.label) : ""}
          </span>
        ))}
      </div>
      {line && (
        <p aria-hidden="true" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 pl-7 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-indigo" /> Per day
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-streetlight" /> {lineLabel}: {sum}
          </span>
        </p>
      )}
      <figcaption className="sr-only">{caption}</figcaption>
      <DataTable caption={caption} rows={data.map((d) => [d.label, d.value])} />
    </figure>
  );
}

export type Slice = { label: string; value: number; className: string };

/** A donut with its total in the middle and a legend that spells out every slice. */
export function Donut({ slices, caption, centre, centreLabel }: { slices: Slice[]; caption: string; centre: number | string; centreLabel: string }) {
  const values = slices.map((s) => s.value);
  const paths = donutSlices(values, 60, 60, 54, 36);
  const pct = percents(values);
  const empty = values.every((v) => v === 0);

  return (
    <figure className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-4">
      <svg viewBox="0 0 120 120" role="img" aria-label={caption} className="h-36 w-36 shrink-0">
        {empty ? <circle cx="60" cy="60" r="45" fill="none" strokeWidth={18} className="stroke-canvas" /> : paths.map((d, i) => d && <path key={slices[i].label} d={d} className={slices[i].className} />)}
        <text x="60" y="58" textAnchor="middle" className="fill-ink text-[22px] font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>
          {centre}
        </text>
        <text x="60" y="74" textAnchor="middle" className="fill-muted text-[9px]">
          {centreLabel}
        </text>
      </svg>
      <ul className="min-w-0 flex-1 basis-40 space-y-2 text-[14px]">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2.5">
            <svg aria-hidden="true" viewBox="0 0 10 10" className="h-2.5 w-2.5 shrink-0">
              <rect width="10" height="10" rx="2" className={s.className} />
            </svg>
            <span className="flex-1">{s.label}</span>
            <span className="font-medium tabular-nums">{s.value}</span>
            <span className="w-9 text-right text-muted tabular-nums">{pct[i]}%</span>
          </li>
        ))}
      </ul>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

/** Labelled bars with a count and a share each, like Regalwa's client-status breakdown. */
export function ProgressList({ rows, caption }: { rows: { label: string; value: number }[]; caption: string }) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  const pct = percents(rows.map((r) => r.value));
  return (
    <figure className="mt-5">
      <ul className="space-y-3.5 text-[14px]">
        {rows.map((r, i) => (
          <li key={r.label}>
            <div className="flex items-baseline justify-between gap-2">
              <span>{r.label}</span>
              <span className="tabular-nums">
                <span className="font-medium">{r.value}</span> <span className="text-muted">· {pct[i]}%</span>
              </span>
            </div>
            <div aria-hidden="true" className="mt-1.5 h-2 rounded-full bg-canvas">
              <div className="h-full rounded-full bg-indigo" style={{ width: `${total ? (r.value * 100) / total : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}
