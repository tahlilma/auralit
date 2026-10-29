'use client';
import { useParams } from 'next/navigation';
import { EntityPage } from '@/components/entity-page';

export function EntityRoute() {
  const { entity } = useParams<{ entity: string }>();
  return <EntityPage entityKey={entity} />;
}
