import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: { default: 'Crew Health', template: '%s · Crew Health' },
  description: 'Astronaut health monitoring for deep-space missions: live vitals, sleep, mental health, medication and an onboard medical agent.',
};

export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#07080B' }, { media: '(prefers-color-scheme: light)', color: '#eef2f7' }],
};

// Runs before first paint so a remembered light theme never flashes dark. Dark is the default.
const themeScript = `try{if(localStorage.getItem('crew-health-theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
