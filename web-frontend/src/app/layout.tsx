import type { Metadata, Viewport } from 'next';
import './globals.css';
import { MissionProvider } from '@/lib/mission';
import { BackendProvider } from '@/lib/backend';
import { Header } from '@/components/Header';
import { GlobalAlerts } from '@/components/GlobalAlerts';
import { MarsDelayBar } from '@/components/MarsDelayBar';
import { HeartbeatPlayer } from '@/components/Heartbeat';

export const metadata: Metadata = {
  title: { default: 'Crew Health', template: '%s · Crew Health' },
  description: 'Astronaut health monitoring for deep-space missions: live vitals, sleep, mental health, medication and an onboard medical agent.',
};

export const viewport: Viewport = { themeColor: '#000000', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <BackendProvider>
          <MissionProvider>
            <Header />
            <MarsDelayBar />
            <GlobalAlerts />
            <main id="main" className="mx-auto max-w-[1680px] px-4 pb-20 pt-6 md:px-8">{children}</main>
            <HeartbeatPlayer />
          </MissionProvider>
        </BackendProvider>
      </body>
    </html>
  );
}
