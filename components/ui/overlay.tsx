'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { Button, cx, IconButton, Input } from './primitives';

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
}

function Portal({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.body), []);
  return el ? createPortal(children, el) : null;
}

export function Modal({ open, onClose, title, children, footer, size = 'md', subtitle }: { open: boolean; onClose: () => void; title?: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' }) {
  useEscape(open, onClose);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl', full: 'max-w-[96vw]' }[size];
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[6vh] backdrop-blur-[2px] anim-fade" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className={cx('w-full rounded-2xl border border-line bg-surface shadow-pop anim-pop', w)} role="dialog" aria-modal="true">
          {title && (
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
              <div><h2 className="text-[15px] font-semibold">{title}</h2>{subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}</div>
              <IconButton label="Close" onClick={onClose}><X className="size-4" /></IconButton>
            </div>
          )}
          <div className="px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3 rounded-b-2xl">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}

export function Drawer({ open, onClose, title, children, footer, width = 'max-w-2xl', subtitle }: { open: boolean; onClose: () => void; title?: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px] anim-fade" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
        <aside className={cx('absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-surface shadow-pop anim-slide', width)} role="dialog" aria-modal="true">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0"><h2 className="truncate text-base font-semibold">{title}</h2>{subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}</div>
            <IconButton label="Close" onClick={onClose}><X className="size-4" /></IconButton>
          </div>
          <div className="thin-scroll flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">{footer}</div>}
        </aside>
      </div>
    </Portal>
  );
}

// ───────── Toasts ─────────
type Toast = { id: number; kind: 'ok' | 'error' | 'info' | 'warn'; text: string };
type ConfirmOpts = { title: string; body?: ReactNode; confirm?: string; danger?: boolean; input?: { label: string; type?: string; placeholder?: string } };
const Ctx = createContext<{ toast: (text: string, kind?: Toast['kind']) => void; confirm: (o: ConfirmOpts) => Promise<false | string> } | null>(null);

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [conf, setConf] = useState<(ConfirmOpts & { resolve: (v: false | string) => void }) | null>(null);
  const [inputVal, setInputVal] = useState('');
  const n = useRef(0);
  const toast = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = ++n.current;
    setToasts(t => [...t, { id, kind, text }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<false | string>(resolve => { setInputVal(''); setConf({ ...o, resolve }); }), []);
  const close = (v: false | string) => { conf?.resolve(v); setConf(null); };
  const icon = { ok: <CheckCircle2 className="size-4 text-ok" />, error: <XCircle className="size-4 text-bad" />, info: <Info className="size-4 text-info" />, warn: <AlertTriangle className="size-4 text-warn" /> };
  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <Portal>
        <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
          {toasts.map(t => (
            <div key={t.id} className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm shadow-pop anim-pop">
              <span className="mt-0.5">{icon[t.kind]}</span><span className="flex-1">{t.text}</span>
              <button className="text-muted hover:text-ink" onClick={() => setToasts(x => x.filter(y => y.id !== t.id))}><X className="size-3.5" /></button>
            </div>
          ))}
        </div>
      </Portal>
      <Modal open={!!conf} onClose={() => close(false)} title={conf?.title} size="sm"
        footer={<><Button onClick={() => close(false)}>Cancel</Button><Button variant={conf?.danger ? 'danger' : 'primary'} disabled={!!conf?.input && !inputVal} onClick={() => close(conf?.input ? inputVal : 'yes')}>{conf?.confirm ?? 'Confirm'}</Button></>}>
        {conf?.body && <div className="text-sm text-ink-2">{conf.body}</div>}
        {conf?.input && (
          <div className="mt-3"><label className="text-xs font-medium text-ink-2">{conf.input.label}</label>
            <Input autoFocus type={conf.input.type ?? 'text'} placeholder={conf.input.placeholder} value={inputVal} onChange={e => setInputVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && inputVal) close(inputVal); }} className="mt-1" />
          </div>
        )}
      </Modal>
    </Ctx.Provider>
  );
}

export function useUI() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useUI outside OverlayProvider');
  return c;
}
