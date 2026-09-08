import Link from "next/link";

export function OwnerNav({ active }: { active: string }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">OWNER CONSOLE</span>
          <h1>
            {active === "overview"
              ? "Overview"
              : active === "accounts"
                ? "Accounts"
                : active === "site"
                  ? "Site settings"
                  : "Activity"}
          </h1>
        </div>
        <span className="admin-badge">Environment-managed owner</span>
      </div>
      <nav className="owner-tabs" aria-label="Owner console">
        {["overview", "accounts", "site", "activity"].map((section) => (
          <Link
            key={section}
            href={section === "overview" ? "/admin" : `/admin/${section}`}
            aria-current={active === section ? "page" : undefined}
          >
            {section === "site"
              ? "Site"
              : section[0].toUpperCase() + section.slice(1)}
          </Link>
        ))}
      </nav>
    </>
  );
}
