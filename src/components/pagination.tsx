import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

export function Pagination({
  page,
  total,
  pageSize,
  href,
}: {
  page: number;
  total: number;
  pageSize: number;
  href: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1 && page === 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <div>
        {page > 1 && (
          <Link className="button secondary small" href={href(page - 1)}>
            <ArrowLeft size={14} /> Previous
          </Link>
        )}
      </div>
      <span>
        Page {page} of {pages}
        <small>{total} results</small>
      </span>
      <div>
        {page < pages && (
          <Link className="button secondary small" href={href(page + 1)}>
            Next <ArrowRight size={14} />
          </Link>
        )}
      </div>
    </nav>
  );
}
