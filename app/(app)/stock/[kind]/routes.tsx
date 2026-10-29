'use client';
import { useParams } from 'next/navigation';
import { ErrorBox } from '@/components/ui/primitives';
import { StockDocView, StockEditor, StockList, type SKind } from '@/components/stock';

const KINDS = ['transfer_b', 'transfer_w', 'delivery', 'receive', 'disposal', 'bad_claim', 'self_bad'];
function useKind() {
  const p = useParams<{ kind: string; id?: string }>();
  return { kind: p.kind as SKind, id: p.id ? Number(p.id) : undefined, ok: KINDS.includes(p.kind) };
}
export function ListRoute() { const { kind, ok } = useKind(); return ok ? <StockList key={kind} kind={kind} /> : <ErrorBox error="Unknown stock document." />; }
export function NewRoute() { const { kind, ok } = useKind(); return ok ? <StockEditor key={kind} kind={kind} /> : <ErrorBox error="Unknown stock document." />; }
export function ViewRoute() { const { kind, id, ok } = useKind(); return ok && id ? <StockDocView key={id} kind={kind} id={id} /> : <ErrorBox error="Unknown record." />; }
