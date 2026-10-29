'use client';
import { useSearchParams } from 'next/navigation';
import { ReportRoles } from '@/components/admin';

export default function Page() {
  const role = Number(useSearchParams().get('role')) || undefined;
  return <ReportRoles key={role} initialRole={role} />;
}
