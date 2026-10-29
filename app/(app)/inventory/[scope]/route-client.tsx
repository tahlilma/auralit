'use client';
import { useParams } from 'next/navigation';
import { ErrorBox } from '@/components/ui/primitives';
import { StockStatus } from '@/components/stock';

export function ScopeRoute() {
  const { scope } = useParams<{ scope: string }>();
  if (scope !== 'branch' && scope !== 'warehouse' && scope !== 'combined') return <ErrorBox error="Unknown stock view." />;
  return <StockStatus key={scope} scope={scope} />;
}
