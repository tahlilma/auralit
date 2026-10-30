'use client';
import { useState, type ReactNode } from 'react';
import { SessionProvider } from './session';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

/*
  Framed sheet: the sidebar and the 48px top bar share one tinted frame with no rule between them; the
  page is a white sheet inset 8px from the window's right and bottom edges (1px edge, 16px corners, no
  shadow). The sheet scrolls; the frame stays put. On a phone the frame folds away and the sheet is the screen.
*/
export function AppShell({ children }: { children: ReactNode }) {
  const [mobile, setMobile] = useState(false);
  return (
    <SessionProvider>
      <div className="flex h-dvh bg-frame print:block print:h-auto">
        <Sidebar mobileOpen={mobile} onClose={() => setMobile(false)} />
        <div className="flex min-w-0 flex-1 flex-col print:block">
          <Topbar onMenu={() => setMobile(true)} />
          <div id="sheet" className="print-sheet sheet-scroll min-h-0 flex-1 overflow-y-auto bg-surface lg:mb-2 lg:mr-2 lg:rounded-[16px] lg:border lg:border-line">
            <main className="mx-auto w-full max-w-[1480px] px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-7 print:p-0">{children}</main>
          </div>
        </div>
      </div>
    </SessionProvider>
  );
}
