'use client';
import { useParams } from 'next/navigation';
import { ErrorBox } from '@/components/ui/primitives';
import { VoucherEditor, VoucherList, VoucherView, type VKind } from '@/components/vouchers';

const KINDS = ['payment', 'receipt', 'journal', 'contra', 'expense', 'donation'];
function useKind() {
  const p = useParams<{ kind: string; id?: string }>();
  return { kind: p.kind as VKind, id: p.id ? Number(p.id) : undefined, ok: KINDS.includes(p.kind) };
}
export function ListRoute() { const { kind, ok } = useKind(); return ok ? <VoucherList key={kind} kind={kind} /> : <ErrorBox error="Unknown voucher type." />; }
export function NewRoute() { const { kind, ok } = useKind(); return ok ? <VoucherEditor key={kind} kind={kind} /> : <ErrorBox error="Unknown voucher type." />; }
export function ViewRoute() { const { kind, id, ok } = useKind(); return ok && id ? <VoucherView key={id} kind={kind} id={id} /> : <ErrorBox error="Unknown voucher." />; }
export function EditRoute() { const { kind, id, ok } = useKind(); return ok && id ? <VoucherEditor key={id} kind={kind} id={id} /> : <ErrorBox error="Unknown voucher." />; }
