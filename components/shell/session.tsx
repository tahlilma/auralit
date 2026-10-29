'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { rpc, type RpcResult } from '@/lib/client/rpc';
import { can as canFn, type Action } from '@/lib/permissions';
import { Loading } from '@/components/ui/primitives';

type Me = RpcResult<'admin.me'>;
type Ctx = { me: Me; can: (mod: string | undefined, action?: Action) => boolean; reload: () => Promise<void>; settings: Record<string, string>; company: any; reloadSettings: () => Promise<void> };
const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [company, setCompany] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setMe(await rpc('admin.me')); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  const loadSettings = useCallback(async () => {
    const [s, c] = await Promise.all([rpc('admin.getSettings'), rpc('admin.getCompany')]);
    setSettings(s); setCompany(c);
  }, []);
  useEffect(() => { void load(); void loadSettings(); }, [load, loadSettings]);
  if (error) return <div className="p-10 text-sm text-bad">{error}</div>;
  if (!me) return <div className="flex h-screen items-center justify-center"><Loading label="Loading workspace…" /></div>;
  const can = (mod: string | undefined, action: Action = 'read') => !mod || canFn(me.perms as any, !!me.is_admin, mod, action);
  return <SessionCtx.Provider value={{ me, can, reload: load, settings, company, reloadSettings: loadSettings }}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error('useSession outside SessionProvider');
  return c;
}

export function Guard({ module, action = 'read', children }: { module: string; action?: Action; children: ReactNode }) {
  const { can } = useSession();
  if (!can(module, action)) return <div className="mx-auto mt-24 max-w-md rounded-xl border border-line bg-surface p-6 text-center text-sm text-muted">You don&apos;t have permission to view this page. Ask an administrator to update your role.</div>;
  return <>{children}</>;
}
