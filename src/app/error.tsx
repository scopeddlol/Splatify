"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <span className="eyebrow">A SHORT TIMEOUT</span>
      <h1>We couldn&apos;t load this plan.</h1>
      <p>
        Please try again in a moment. If this is a fresh installation, check
        that PostgreSQL is running and the database migration completed.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
      <Link href="/" className="text-link">
        Back to home
      </Link>
    </main>
  );
}
