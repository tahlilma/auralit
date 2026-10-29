import { Suspense } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { Loading } from '@/components/ui/primitives';

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <AppShell>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </AppShell>
  );
}
