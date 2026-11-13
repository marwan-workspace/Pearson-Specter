import type { Metadata, Viewport } from 'next';
import './globals.css';
import { BackendShell } from '@/components/BackendShell';

export const metadata: Metadata = {
  title: { default: 'Crew Health', template: '%s · Crew Health' },
  description: 'Astronaut health monitoring for deep-space missions: live vitals, sleep, mental health, medication and an onboard medical agent.',
};

export const viewport: Viewport = { themeColor: '#091426', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <BackendShell>{children}</BackendShell>
      </body>
    </html>
  );
}
