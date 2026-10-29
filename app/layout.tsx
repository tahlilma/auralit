import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { OverlayProvider } from '@/components/ui/overlay';
import './globals.css';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] });
const mono = JetBrains_Mono({ variable: '--font-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: 'Auralit ERP', template: '%s · Auralit ERP' },
  description: 'Purchase, sales, inventory, accounting and payroll in one place.',
};

const themeScript = `try{var t=localStorage.getItem('auralit.theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <OverlayProvider>{children}</OverlayProvider>
      </body>
    </html>
  );
}
