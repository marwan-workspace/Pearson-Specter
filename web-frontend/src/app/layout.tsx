import type { Metadata, Viewport } from 'next';
import { preload } from 'react-dom';
import './globals.css';
import { BackendShell } from '@/components/BackendShell';

export const metadata: Metadata = {
  title: { default: 'Crew Health', template: '%s · Crew Health' },
  description: 'Astronaut health monitoring for deep-space missions: live vitals, sleep, mental health, medication and an onboard medical agent.',
};

export const viewport: Viewport = { themeColor: '#091426', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Start downloading the 3.4 MB suit model with the HTML, instead of after three.js has loaded and parsed.
  // The Draco decoder unpacks it; fetch both alongside rather than after the model arrives.
  for (const href of ['/models/emu.glb', '/draco/draco_wasm_wrapper.js', '/draco/draco_decoder.wasm']) preload(href, { as: 'fetch', crossOrigin: 'anonymous' });
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <BackendShell>{children}</BackendShell>
      </body>
    </html>
  );
}
