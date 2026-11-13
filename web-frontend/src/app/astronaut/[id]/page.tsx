'use client';

import { useParams } from 'next/navigation';
import { BackendRecord } from '@/components/BackendRecord';

export default function AstronautPage() {
  const params=useParams<{id:string}>();
  return <BackendRecord astronautKey={String(params.id||'')} />;
}
