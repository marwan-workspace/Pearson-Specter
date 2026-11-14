import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="panel mx-auto mt-10 max-w-xl p-6">
      <h1 className="display text-2xl">No crew member here</h1>
      <p className="mt-2 text-secondary">That record does not exist. The crew overview lists everyone on board.</p>
      <Link href="/" className="btn btn-primary mt-5">Go to crew overview</Link>
    </div>
  );
}
