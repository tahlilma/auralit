'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiModules } from '@/lib/server/rpc';

type ApiName = { [M in keyof ApiModules]: `${M & string}.${keyof ApiModules[M] & string}` }[keyof ApiModules];
type Fn<N extends string> = N extends `${infer M}.${infer F}`
  ? M extends keyof ApiModules ? F extends keyof ApiModules[M] ? ApiModules[M][F] : never : never
  : never;
export type RpcArgs<N extends ApiName> = Fn<N> extends (u: any, ...a: infer A) => any ? A : never;
export type RpcResult<N extends ApiName> = Fn<N> extends (...a: any[]) => infer R ? Awaited<R> : never;

export class RpcError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function rpc<N extends ApiName>(name: N, ...args: RpcArgs<N>): Promise<RpcResult<N>> {
  const res = await fetch('/api/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fn: name, args }) });
  const data = await res.json().catch(() => ({ error: 'The server returned an invalid response.' }));
  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  if (!res.ok || data.error) throw new RpcError(data.error ?? `Request failed (${res.status})`, res.status);
  return data.result as RpcResult<N>;
}

/** Loads data from an RPC function, re-running when `deps` change. */
export function useRpc<N extends ApiName>(name: N | null, args: RpcArgs<N>, deps: unknown[] = []) {
  const [data, setData] = useState<RpcResult<N> | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!name);
  const seq = useRef(0);
  const argsRef = useRef(args);
  argsRef.current = args;
  const load = useCallback(async () => {
    if (!name) return;
    const my = ++seq.current;
    setLoading(true);
    try {
      const r = await rpc(name, ...argsRef.current);
      if (my === seq.current) { setData(r); setError(null); }
    } catch (e) {
      if (my === seq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (my === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, ...deps]);
  useEffect(() => { void load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}
