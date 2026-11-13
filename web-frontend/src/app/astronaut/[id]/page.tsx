import { notFound } from 'next/navigation';
import { CREW } from '@/lib/crew';
import { AstronautView } from '@/components/AstronautView';

export function generateStaticParams() {
  return CREW.map((c) => ({ id: c.id }));
}

export default async function AstronautPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!CREW.some((c) => c.id === id)) notFound();
  return <AstronautView id={id} />;
}
