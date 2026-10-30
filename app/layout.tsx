import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { OverlayProvider } from '@/components/ui/overlay';
import './globals.css';

const plex = IBM_Plex_Sans({ variable: '--font-plex', subsets: ['latin'], weight: ['400', '500', '600'] });
const plexMono = IBM_Plex_Mono({ variable: '--font-plex-mono', subsets: ['latin'], weight: ['400', '500'] });

export const metadata: Metadata = {
  title: { default: 'Auralit', template: '%s · Auralit' },
  description: 'Point of sale, purchasing, stock and accounts for retail and trading businesses.',
};

const themeScript = `try{if(localStorage.getItem('auralit.theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${plex.variable} ${plexMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <OverlayProvider>{children}</OverlayProvider>
      </body>
    </html>
  );
}
