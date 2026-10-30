'use client';
import { useEffect, useRef, useState } from 'react';
import { money, num } from '@/lib/format';

/* Small SVG charts drawn to the app rules: one hue per series (three at most), straight segments,
   no fill, 3–5 round gridlines with the top tick above the maximum, flat x labels pulled inside the plot. */

function useWidth(fallback = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const compact = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e7) return `${+(v / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${+(v / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${+(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return String(Math.round(v));
};

/** Round, even ticks; the top one sits above the maximum so the line never touches the plot's edge. */
function niceTicks(max: number, min = 0, count = 4) {
  const span = Math.max(max - min, 1);
  const raw = span / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * pow).find(s => span / s <= count) ?? pow * 10;
  const lo = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= max + step * 0.0001 || out.length < 2; v += step) out.push(+v.toFixed(6));
  if (out[out.length - 1] <= max) out.push(+(out[out.length - 1] + step).toFixed(6));
  return out;
}

const fmtX = (k: string) => {
  if (/^\d{4}-\d{2}$/.test(k)) return new Date(k + '-01T00:00:00').toLocaleString('en', { month: 'short' });
  if (/^\d{4}-\d{2}-\d{2}$/.test(k)) { const d = new Date(k + 'T00:00:00'); return `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}`; }
  return k;
};

/** Evenly spaced label indexes, first and last included, 2–7 of them. */
function labelIdx(n: number, width: number) {
  const want = Math.max(2, Math.min(7, Math.floor(width / 110)));
  if (n <= want) return [...Array(n).keys()];
  const step = Math.ceil((n - 1) / (want - 1));
  const out: number[] = [];
  for (let i = 0; i < n; i += step) out.push(i);
  if (out[out.length - 1] !== n - 1) { if (n - 1 - out[out.length - 1] < step / 2) out.pop(); out.push(n - 1); }
  return out;
}

export type Series = { key: string; label: string; color: string };

export function LineChart({ data, xKey, series, height = 220, format = 'money', empty = 'No activity in this period' }: { data: Record<string, any>[]; xKey: string; series: Series[]; height?: number; format?: 'money' | 'number'; empty?: string }) {
  const [box, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const H = height, pl = 48, pr = 12, pt = 12, pb = 28;
  const vals = data.flatMap(d => series.map(s => Number(d[s.key]) || 0));
  const max = Math.max(0, ...vals), min = Math.min(0, ...vals);
  const ticks = niceTicks(max, min);
  const top = ticks[ticks.length - 1], bottom = ticks[0];
  const x = (i: number) => pl + (data.length <= 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (data.length - 1));
  const y = (v: number) => pt + (H - pt - pb) * (1 - (v - bottom) / (top - bottom || 1));
  const fmt = (v: number) => (format === 'money' ? money(v) : num(v));
  const allZero = vals.every(v => v === 0);
  const slot = (W - pl - pr) / Math.max(1, data.length - 1);
  return (
    <div ref={box} className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label={series.map(s => s.label).join(', ')}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={v === 0 ? 1.5 : 1} />
            <text x={pl - 8} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--muted)">{compact(v)}</text>
          </g>
        ))}
        {series.map((s, si) => {
          const pts = data.map((d, i) => `${x(i)},${y(Number(d[s.key]) || 0)}`);
          const split = hover !== null && si === 0 && series.length === 1;
          return (
            <g key={s.key}>
              {split ? (
                <>
                  <polyline points={pts.slice(0, hover! + 1).join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  <polyline points={pts.slice(hover!).join(' ')} fill="none" stroke="var(--control)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                </>
              ) : (
                <polyline points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth={si === 0 ? 2 : 1.5} strokeLinejoin="round" strokeLinecap="round" />
              )}
              {data.length < 3 && data.map((d, i) => <circle key={i} cx={x(i)} cy={y(Number(d[s.key]) || 0)} r="3.5" fill={s.color} />)}
            </g>
          );
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pt} y2={H - pb} stroke="var(--muted)" strokeDasharray="3 3" strokeWidth="1" />
            {series.map(s => <circle key={s.key} cx={x(hover)} cy={y(Number(data[hover][s.key]) || 0)} r="4" fill="var(--surface)" stroke={s.color} strokeWidth="2" />)}
          </g>
        )}
        {labelIdx(data.length, W).map(i => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'} fontSize="12" fill="var(--muted)">{fmtX(String(data[i][xKey]))}</text>
        ))}
        {data.map((_, i) => (
          <rect key={i} x={x(i) - slot / 2} y={pt} width={slot} height={H - pt - pb} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {allZero && <text x={(W + pl) / 2} y={y(0) - 10} textAnchor="middle" fontSize="13" fill="var(--muted)">{empty}</text>}
      </svg>
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute top-0 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12.5px] shadow-pop" style={{ left: Math.min(Math.max(x(hover) - 70, 0), W - 170) }}>
          <p className="text-muted">{fmtX(String(data[hover][xKey]))}</p>
          {series.map(s => <p key={s.key} className="num text-ink">{series.length > 1 && <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: s.color }} />}{series.length > 1 ? `${s.label} ` : ''}<b className="font-medium">{fmt(Number(data[hover][s.key]) || 0)}</b></p>)}
        </div>
      )}
      {series.length > 1 && <div className="mt-2 flex flex-wrap gap-4 text-[12.5px] text-muted">{series.map(s => <span key={s.key} className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />{s.label}</span>)}</div>}
    </div>
  );
}

/** Kept for callers that asked for an area: the rules draw it as a plain line. */
export const AreaChart = LineChart;

/** Columns with square corners; one hue per series, three series at most. */
export function BarChart({ data, xKey, series, height = 220, format = 'money' }: { data: Record<string, any>[]; xKey: string; series: Series[]; height?: number; format?: 'money' | 'number' }) {
  const [box, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const H = height, pl = 48, pr = 8, pt = 12, pb = 28;
  const vals = data.flatMap(d => series.map(s => Number(d[s.key]) || 0));
  const ticks = niceTicks(Math.max(0, ...vals), Math.min(0, ...vals));
  const top = ticks[ticks.length - 1], bottom = ticks[0];
  const y = (v: number) => pt + (H - pt - pb) * (1 - (v - bottom) / (top - bottom || 1));
  const bw = (W - pl - pr) / Math.max(1, data.length);
  const inner = Math.min(32, (bw * 0.64) / series.length);
  const fmt = (v: number) => (format === 'money' ? money(v) : num(v));
  if (!data.length) return <div className="flex items-center justify-center text-[14px] text-muted" style={{ height }}>No activity in this period</div>;
  return (
    <div ref={box} className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img">
        {ticks.map(v => <g key={v}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={v === 0 ? 1.5 : 1} /><text x={pl - 8} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--muted)">{compact(v)}</text></g>)}
        {data.map((d, i) => {
          const x0 = pl + i * bw + (bw - inner * series.length) / 2;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={pl + i * bw} y={pt} width={bw} height={H - pt - pb} fill={hover === i ? 'var(--raised)' : 'transparent'} />
              {series.map((s, j) => { const v = Number(d[s.key]) || 0; const y0 = y(Math.max(0, v)), y1 = y(Math.min(0, v)); return <rect key={s.key} x={x0 + j * inner} y={y0} width={Math.max(1, inner - 2)} height={Math.max(0, y1 - y0)} fill={s.color} />; })}
            </g>
          );
        })}
        {labelIdx(data.length, W).map(i => <text key={i} x={pl + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--muted)">{fmtX(String(data[i][xKey]))}</text>)}
      </svg>
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute top-0 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12.5px] shadow-pop" style={{ left: Math.min(Math.max(pl + hover * bw - 50, 0), W - 170) }}>
          <p className="text-muted">{fmtX(String(data[hover][xKey]))}</p>
          {series.map(s => <p key={s.key} className="num text-ink">{series.length > 1 && <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: s.color }} />}{series.length > 1 ? `${s.label} ` : ''}<b className="font-medium">{fmt(Number(data[hover][s.key]) || 0)}</b></p>)}
        </div>
      )}
      {series.length > 1 && <div className="mt-2 flex flex-wrap gap-4 text-[12.5px] text-muted">{series.map(s => <span key={s.key} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: s.color }} />{s.label}</span>)}</div>}
    </div>
  );
}

/** A ranked list with a thin bar under each label: grey, the first one in ink. */
export function RankBars({ items, format = 'money', limit }: { items: { label: string; value: number; sub?: string }[]; color?: string; format?: 'money' | 'number'; limit?: number }) {
  const list = limit ? items.slice(0, limit) : items;
  const max = Math.max(1, ...list.map(i => i.value));
  if (!list.length) return <p className="py-6 text-[14px] text-muted">Nothing in this period.</p>;
  return (
    <ol className="space-y-3">
      {list.map((it, i) => (
        <li key={i}>
          <div className="flex items-baseline justify-between gap-3 text-[14px]">
            <span className="min-w-0 truncate text-ink">{it.label}{it.sub && <span className="ml-1.5 text-[12.5px] text-muted">{it.sub}</span>}</span>
            <span className="num shrink-0 text-ink">{format === 'money' ? money(it.value) : num(it.value)}</span>
          </div>
          <div className="mt-1.5 h-[3px] rounded-full"><div className="h-full rounded-full" style={{ width: `${(it.value / max) * 100}%`, background: i === 0 ? 'var(--ink)' : 'var(--control)' }} /></div>
        </li>
      ))}
    </ol>
  );
}
