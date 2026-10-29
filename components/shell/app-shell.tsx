'use client';
import { useState, type ReactNode } from 'react';
import { SessionProvider } from './session';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

export function AppShell({ children }: { children: ReactNode }) {
  const [mobile, setMobile] = useState(false);
  return (
    <SessionProvider>
      <div className="flex min-h-screen">
        <Sidebar mobileOpen={mobile} onClose={() => setMobile(false)} />
        <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
          <Topbar onMenu={() => setMobile(true)} />
          <main className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-5 sm:px-6">{children}</main>
        </div>
      </div>
    </SessionProvider>
  );
}
