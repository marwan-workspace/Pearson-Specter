import type { Metadata } from 'next';
import './globals.css';
import { MissionProvider } from '@/lib/mission';
import { Header } from '@/components/Header';
import { GlobalAlerts } from '@/components/GlobalAlerts';
import { MarsDelayBar } from '@/components/MarsDelayBar';
import { HeartbeatPlayer } from '@/components/Heartbeat';

export const metadata: Metadata = {
  title: 'Astronaut Health · Crew Dashboard',
  description: 'NASA Space Apps: astronaut health vitals monitoring dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <MissionProvider>
          <Header />
          <MarsDelayBar />
          <GlobalAlerts />
          <main className="mx-auto max-w-[1600px] px-4 pb-16 pt-5 md:px-8">{children}</main>
          <HeartbeatPlayer />
        </MissionProvider>
      </body>
    </html>
  );
}
