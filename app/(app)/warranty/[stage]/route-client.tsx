'use client';
import { useParams } from 'next/navigation';
import { ErrorBox } from '@/components/ui/primitives';
import { WarrantyPage, WarrantyStock } from '@/components/warranty';

export function StageRoute() {
  const { stage } = useParams<{ stage: string }>();
  if (stage === 'stock') return <WarrantyStock />;
  if (stage === 'claims' || stage === 'checking' || stage === 'manage' || stage === 'delivered') return <WarrantyPage key={stage} stage={stage} />;
  return <ErrorBox error="Unknown warranty page." />;
}
