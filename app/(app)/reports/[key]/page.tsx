'use client';
import { useParams } from 'next/navigation';
import { ReportRunner } from '@/components/reports';

export default function Page() {
  const { key } = useParams<{ key: string }>();
  return <ReportRunner key={key} reportKey={key} />;
}
