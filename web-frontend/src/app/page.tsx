'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { CrewOverview } from '@/components/CrewOverview';
import { Skeleton } from '@/components/ui';

/** The acting leader sees the crew overview; everyone else goes straight to their own record. */
export default function HomePage() {
  const { me } = useSession();
  const router = useRouter();
  useEffect(() => { if (me && !me.isActingLeader) router.replace(`/astronaut/${me.astronaut.callsign.toLowerCase()}`); }, [me, router]);
  if (!me?.isActingLeader) return <div role="status" aria-label="Opening your health record" className="grid gap-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full" /></div>;
  return <CrewOverview />;
}
