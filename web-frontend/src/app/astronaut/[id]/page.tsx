'use client';

import { useParams } from 'next/navigation';
import { RecordPage } from '@/components/RecordPage';

export default function AstronautPage() {
  const id = String(useParams<{ id: string }>().id || '');
  // key: a different astronaut gets a fresh record, cursor and chat state
  return <RecordPage key={id} astronautKey={id} />;
}
