import Link from 'next/link';
import { CATALOG_VERSION, ROUTES } from '@/lib/catalog';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">CarePath</h1>
      <p className="mt-3 text-[color:var(--color-muted)]">
        Temporary, phone-friendly walking directions for hospital visitors.
      </p>

      <Link
        href="/desk"
        className="mt-10 inline-block rounded-lg bg-[color:var(--color-brand)] px-6 py-4 text-lg font-semibold text-white hover:bg-[color:var(--color-brand-dark)]"
      >
        Open the receptionist desk
      </Link>

      <p className="mt-10 text-sm text-[color:var(--color-muted)]">
        Visitor pages are reached only by scanning a QR code. Route catalog {CATALOG_VERSION}, {ROUTES.length} approved
        routes.
      </p>
    </main>
  );
}
