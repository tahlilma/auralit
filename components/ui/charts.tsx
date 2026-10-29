'use client';
import { useEffect, useRef, useState } from 'react';

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
import { money, num } from '@/lib/format';

const compact = (v: number) => (Math.abs(v) >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : Math.abs(v) >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(Math.round(v)));

function ticks(max: number) {
  if (max <= 0) return [0];
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / step;
  const s = n > 5 ? step * 2 : n > 2 ? step : step / 2;
  const out: number[] = [];
  for (let v = 0; v <= max * 1.05; v += s) out.push(v);
  return out;
}

export type Series = { key: string; label: string; color: string };

/** Grouped bar chart. */
export function BarChart({ data, xKey, series, height = 220, format = 'money' }: { data: Record<string, any>[]; xKey: string; series: Series[]; height?: number; format?: 'money' | 'number' }) {
  const [hover, setHover] = useState<number | null>(null);
  const [box, width] = useWidth();
  const W = width, H = height, pl = 44, pb = 26, pt = 10;
  const max = Math.max(1, ...data.flatMap(d => series.map(s => Number(d[s.key]) || 0)));
  const t = ticks(max);
  const top = t[t.length - 1] || max;
  const bw = (W - pl) / Math.max(1, data.length);
  const inner = Math.min(28, (bw * 0.7) / series.length);
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / top);
  if (!data.length) return <div className="flex items-center justify-center text-sm text-muted" style={{ height }}>No data for this period</div>;
  return (
    <div ref={box} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        {t.map(v => <g key={v}><line x1={pl} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={pl - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">{compact(v)}</text></g>)}
        {data.map((d, i) => {
          const x0 = pl + i * bw + (bw - inner * series.length) / 2;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pl + i * bw} y={pt} width={bw} height={H - pt - pb} fill={hover === i ? 'var(--surface-3)' : 'transparent'} />
              {series.map((s, j) => { const v = Number(d[s.key]) || 0; return <rect key={s.key} x={x0 + j * inner} y={y(Math.max(0, v))} width={inner - 2} height={Math.max(0, H - pb - y(Math.max(0, v)))} rx={3} fill={s.color} />; })}
              {(data.length <= 16 || i % Math.ceil(data.length / 12) === 0) && <text x={pl + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">{String(d[xKey]).slice(-5)}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
          <p className="mb-1 font-medium">{data[hover][xKey]}</p>
          {series.map(s => <p key={s.key} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: s.color }} />{s.label}: <b className="num">{format === 'money' ? money(data[hover][s.key]) : num(data[hover][s.key])}</b></p>)}
        </div>
      )}
      {series.length > 1 && <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">{series.map(s => <span key={s.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}</div>}
    </div>
  );
}

/** Area line chart (single or multi series). */
export function AreaChart({ data, xKey, series, height = 220 }: { data: Record<string, any>[]; xKey: string; series: Series[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [box, width] = useWidth();
  const W = width, H = height, pl = 44, pb = 26, pt = 10;
  const vals = data.flatMap(d => series.map(s => Number(d[s.key]) || 0));
  const max = Math.max(1, ...vals), min = Math.min(0, ...vals);
  const t = ticks(max);
  const top = t[t.length - 1] || max;
  const x = (i: number) => pl + (data.length <= 1 ? (W - pl) / 2 : (i * (W - pl - 8)) / (data.length - 1));
  const y = (v: number) => pt + (H - pt - pb) * (1 - (v - min) / (top - min || 1));
  if (!data.length) return <div className="flex items-center justify-center text-sm text-muted" style={{ height }}>No data for this period</div>;
  return (
    <div ref={box} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseLeave={() => setHover(null)}>
        <defs>{series.map(s => <linearGradient key={s.key} id={`g-${s.key}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity="0.25" /><stop offset="100%" stopColor={s.color} stopOpacity="0" /></linearGradient>)}</defs>
        {t.map(v => <g key={v}><line x1={pl} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={pl - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">{compact(v)}</text></g>)}
        {series.map(s => {
          const pts = data.map((d, i) => `${x(i)},${y(Number(d[s.key]) || 0)}`).join(' ');
          return <g key={s.key}><polygon points={`${x(0)},${y(0)} ${pts} ${x(data.length - 1)},${y(0)}`} fill={`url(#g-${s.key})`} /><polyline points={pts} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />{data.length < 3 && data.map((d, i) => <circle key={i} cx={x(i)} cy={y(Number(d[s.key]) || 0)} r="4" fill={s.color} />)}</g>;
        })}
        {data.map((d, i) => (
          <g key={i}>
            <rect x={x(i) - (W - pl) / data.length / 2} y={pt} width={(W - pl) / data.length} height={H - pt - pb} fill="transparent" onMouseEnter={() => setHover(i)} />
            {hover === i && <line x1={x(i)} x2={x(i)} y1={pt} y2={H - pb} stroke="var(--line-strong)" strokeDasharray="3 3" />}
            {hover === i && series.map(s => <circle key={s.key} cx={x(i)} cy={y(Number(d[s.key]) || 0)} r="3.5" fill={s.color} />)}
            {(i % Math.max(1, Math.ceil(data.length / 10)) === 0 || i === data.length - 1) && <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">{String(d[xKey]).slice(-5)}</text>}
          </g>
        ))}
      </svg>
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
          <p className="mb-1 font-medium">{data[hover][xKey]}</p>
          {series.map(s => <p key={s.key} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: s.color }} />{s.label}: <b className="num">{money(data[hover][s.key])}</b></p>)}
        </div>
      )}
      {series.length > 1 && <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">{series.map(s => <span key={s.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}</div>}
    </div>
  );
}

/** Ranked horizontal bars. */
export function RankBars({ items, color = 'var(--brand)', format = 'money' }: { items: { label: string; value: number; sub?: string }[]; color?: string; format?: 'money' | 'number' }) {
  const max = Math.max(1, ...items.map(i => i.value));
  if (!items.length) return <p className="py-8 text-center text-sm text-muted">No data for this period</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((it, i) => (
        <li key={i}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]"><span className="truncate text-ink">{it.label}{it.sub && <span className="ml-1.5 text-xs text-muted">{it.sub}</span>}</span><span className="num shrink-0 font-medium">{format === 'money' ? money(it.value) : num(it.value)}</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full" style={{ width: `${(it.value / max) * 100}%`, background: color }} /></div>
        </li>
      ))}
    </ul>
  );
}
