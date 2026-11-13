'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { BackendDashboard } from '@/components/BackendDashboard';

export default function HomePage() {
  const { me }=useSession(); const router=useRouter();
  useEffect(()=>{if(me&&!me.isActingLeader) router.replace(`/astronaut/${me.astronaut.callsign.toLowerCase()}`);},[me,router]);
  if(!me?.isActingLeader) return <div className="panel p-6 text-text-2">Opening your private health record…</div>;
  return <BackendDashboard />;
}
