'use client';
import { useParams } from 'next/navigation';
import { DOC_META, type DocKind } from '@/lib/calc';
import { ErrorBox } from '@/components/ui/primitives';
import { DocList } from '@/components/doc/doc-list';
import { DocEditor } from '@/components/doc/doc-editor';
import { ReturnEditor } from '@/components/doc/return-editor';
import { DocView } from '@/components/doc/doc-view';

function useKind() {
  const p = useParams<{ kind: string; id?: string }>();
  const kind = p.kind as DocKind;
  return { kind, id: p.id ? Number(p.id) : undefined, ok: kind in DOC_META };
}

export function ListRoute() {
  const { kind, ok } = useKind();
  return ok ? <DocList key={kind} kind={kind} /> : <ErrorBox error="Unknown document type." />;
}
export function NewRoute() {
  const { kind, ok } = useKind();
  if (!ok) return <ErrorBox error="Unknown document type." />;
  return kind === 'sreturn' || kind === 'preturn' ? <ReturnEditor key={kind} kind={kind} /> : <DocEditor key={kind} kind={kind} />;
}
export function ViewRoute() {
  const { kind, id, ok } = useKind();
  return ok && id ? <DocView key={`${kind}${id}`} kind={kind} id={id} /> : <ErrorBox error="Unknown document." />;
}
export function EditRoute() {
  const { kind, id, ok } = useKind();
  if (!ok || !id) return <ErrorBox error="Unknown document." />;
  if (kind === 'sreturn' || kind === 'preturn') return <ErrorBox error="Returns cannot be edited. Delete the return and create it again." />;
  return <DocEditor key={`${kind}${id}`} kind={kind} id={id} />;
}
