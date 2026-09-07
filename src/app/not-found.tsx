import Link from "next/link";
export default function NotFound() {
  return (
    <main className="error-page">
      <span className="eyebrow">OFF THE FIELD / 404</span>
      <h1>This one&apos;s out of bounds.</h1>
      <p>
        The page or invite wasn&apos;t found. If you were invited, ask the
        organizer for the latest link.
      </p>
      <Link href="/" className="button primary">
        Back to basecamp
      </Link>
    </main>
  );
}
