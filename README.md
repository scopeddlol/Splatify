# Splatify

Self-hosted event planning with private invitations, accountless RSVPs, schedules,
gear lists, announcements, and polls. Built with Next.js 16, React 19, and PostgreSQL
using `pg` and raw SQL. No SMTP, hosted authentication, or ORM is required.

## Privacy And Accounts

- Organizers use accounts. Guests can RSVP through a private invitation without an account.
- Invitation URLs are bearer links: anyone holding one can access the invitation.
  Personal RSVP edit links grant editing access and must be kept private. Do not
  send these URLs to analytics, public issue trackers, or shared logs.
- Ordinary accounts receive single-use recovery codes. Store them in a password
  manager when shown; there is no email-based password recovery. Losing both the
  password and recovery codes means there is no self-service recovery.
- Email addresses are not verified. Do not treat an email address or guest name as
  proof of identity. Administrator privileges come from environment provisioning,
  not from signing up with a particular address.
- The migration runner provisions `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD`.
  The password must be 12-128 characters and is authoritative: changing it and
  rerunning migration updates the password and revokes existing admin sessions.
  Admin recovery codes are disabled; recovery is through the server environment.
  An email already used by an ordinary account is refused, not silently promoted.
  Changing the configured admin email demotes the former managed administrator.

## Local Development

Requirements: Node.js 22, npm, and PostgreSQL 17 (the backend supports PostgreSQL
14+). Commit `package-lock.json` with application dependency changes: CI and Docker
intentionally require `npm ci`, not an unlocked fallback install.

1. Copy `.env.example` to `.env` locally and replace every placeholder. Never commit
   `.env`, private keys, database dumps, or production credentials.
2. Create a local PostgreSQL database and set `DATABASE_URL` to its connection URL.
   Set `APP_URL=http://localhost:3000` and `TRUST_PROXY=0` for `npm run dev`.
   Use distinct disposable databases for local work and integration testing.
3. Run:

```sh
npm ci
npm run db:migrate
npm run dev
```

The migration script loads `.env*` using `@next/env`. The initial schema lives in
`src/lib/schema.sql`, not `scripts/schema.sql`; `scripts/migrate.ts` records migration
versions and holds a PostgreSQL advisory lock. Add new migration versions for
deployed changes instead of editing a previously applied schema.

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Integration tests run only when `TEST_DATABASE_URL` is exported in the test process
environment. Do not assume `npm test` loads `.env`. Tests create temporary schemas;
the test role needs schema creation privileges. Never point this variable at
production. CI supplies it explicitly and migrates its disposable PostgreSQL service
before lint, typecheck, tests, and build.

## Containers

The multi-stage Dockerfile builds standalone output and runs `/app/server.js` as
the non-root `node` user. Static assets and `public/` are copied separately. The
runtime also includes the locked dependency tree (including development tooling)
plus `scripts/`, `src/lib/`, and `tsconfig.json` so the `tsx` migration runner has
`pg`, `zod`, `@next/env`, SQL, and its source imports. This favors a reliable runner
over the smallest possible image. Secrets are excluded from the build context.

```sh
docker build -t splatify:local .
docker compose --env-file .env up -d --wait --wait-timeout 180
```

Use `SPLATIFY_IMAGE=splatify:local` for a local image. Compose is a **production**
configuration and requires an HTTPS `APP_URL`; use the dev server for plain HTTP
development. Production session cookies require HTTPS. Compose refuses missing
values, recognizable credential placeholders, short admin passwords, and database
passwords that are not at least 32 URL-safe characters (`A-Z`, `a-z`, `0-9`, `_`, `-`).
Generate separate random credentials, for example with `openssl rand -hex 32`.
Quote `.env` values containing special characters using Docker Compose dotenv
rules; random hex credentials avoid interpolation and URL-encoding pitfalls.

Compose constructs the container `DATABASE_URL` from `POSTGRES_PASSWORD` and the
internal `db` hostname. The `.env` `DATABASE_URL` is for host-side development only.
PostgreSQL has a persistent named volume and no published port. `migrate` is a
one-shot service; initial web startup waits for successful migration and healthy
PostgreSQL. The web healthcheck requires an implemented, unauthenticated
`GET /api/health`; the included endpoint checks database access and returns 503
when unavailable. It does not return credentials or detailed database errors.

## VPS Setup

Use a Linux amd64 VPS with Docker Engine and Compose v2.24+ installed. The current
publishing workflow builds amd64 only. Allow SSH from trusted networks; allow
public HTTP/HTTPS only for your reverse proxy. Docker access is effectively root
access, so restrict the deployment account and protect its SSH key.

1. Create an operator-owned deployment directory such as `/opt/splatify`, writable
   by the deployment user. Paths must be absolute and use only letters, digits,
   underscores, hyphens, and slashes. Spaces and shell metacharacters are rejected.
2. Install reviewed `compose.yml` and `Caddyfile` from this repository into that
   directory. A separate checkout is optional. Provision `.env` directly on the
   VPS with mode `0600` and restrict the directory to the operator. CI never copies
   an `.env` from the repository or downloads workflow artifacts.
3. Set the real admin variables, a strong `POSTGRES_PASSWORD`, and canonical
   `APP_URL=https://your-hostname`. Keep an encrypted offline copy of credentials.
4. Choose one proxy configuration below. Do not run two proxies on ports 80/443.
5. Configure GitHub deployment access, then merge reviewed changes to `main`.
   Deployment creates `.deploy.env` with the published SHA-tagged, digest-pinned
   image. This file contains image metadata only. Do not commit `.deploy.env*`.

**Existing host reverse proxy:** leave `COMPOSE_PROFILES` unset. Web binds only
`127.0.0.1:3000`; proxy HTTPS traffic to `http://127.0.0.1:3000`. Preserve `Host` and
set `X-Forwarded-Proto`. If using per-IP limits (`TRUST_PROXY=1`), the proxy must
**replace** incoming `X-Forwarded-For` with the direct client's address, not append
untrusted input. A containerized external proxy needs deliberately configured
network access; its `127.0.0.1` is not the VPS loopback interface.

**Bundled Caddy:** set `COMPOSE_PROFILES=tls`, `APP_DOMAIN=your-hostname` (no scheme
or path), `APP_URL=https://your-hostname`, and `TRUST_PROXY=1` in the VPS `.env`.
Point DNS A/AAAA records to the VPS, ensure 80 and 443 TCP and optionally 443 UDP
are free and reachable, then deploy. Caddy obtains certificates automatically and
connects to `web:3000` internally; the loopback web binding remains available and
does not conflict with Caddy's ports. Certificate state is in persistent volumes.
Do not put another CDN/proxy in front without reviewing client-IP trust handling.

Infrastructure files on the VPS are **operator-managed**: deployment does not
`git pull`, upload config files, or overwrite `.env`. Install reviewed config
changes before deploying images that depend on them. Keep config revisions with
your operational records. PostgreSQL and Caddy use major-version tags; review and
pin their digests if your operations policy requires immutable dependencies.

## GitHub Deployment

`CI` runs on PRs and pushes to `main`. `Deploy` only accepts a successful `CI`
workflow run for a push to this repository's `main`, then checks out that exact
40-character commit SHA. It does not consume PR artifacts or execute fork code
with deployment credentials. Protect `main` with review and required CI checks.

The publisher uses `GITHUB_TOKEN` with `packages: write` to publish
`ghcr.io/scopeddlol/splatify:sha-<commit>`. Ensure the GHCR package is linked to
this repository, inherits its access, and is **private**; check the package's
visibility/access settings explicitly, especially if it already exists. The
deployment image also includes the returned `@sha256:...` digest, so moving a tag
cannot change what is deployed.

Create a GitHub environment named **production**, require operator approval, and
restrict deployment to `main`. Add these environment secrets:

- `VPS_HOST`: hostname or IPv4 address, SSH port 22. IPv6 literals/custom ports are
  not supported by this minimal workflow.
- `VPS_USER`: dedicated Linux deployment user with Docker access.
- `VPS_SSH_KEY`: private key matching an authorized key for that user.
- `VPS_KNOWN_HOSTS`: OpenSSH known-hosts entry for exactly `VPS_HOST`. Obtain the
  host public key/fingerprint through the VPS provider console or another trusted
  out-of-band channel and verify it. Do not trust an unverified `ssh-keyscan` result.
- `VPS_DEPLOY_PATH`: preinstalled deployment directory, for example `/opt/splatify`.
- `GHCR_USERNAME`: GitHub username of the pull-only package credential owner.
- `GHCR_TOKEN`: PAT (classic) with `read:packages` and access to this private
  package; authorize organization SSO if needed. Avoid write/delete package scopes.

After the VPS files and all secrets are ready, set the repository Actions variable
`DEPLOY_ENABLED=true`. Until enabled, CI and private image publishing run normally,
but the SSH job is skipped. Environment protection features depend on your GitHub
plan; configure the available protections before enabling deployment.

SSH enforces strict host-key checking. Inputs are validated before constructing
remote arguments; the registry token travels over encrypted stdin, not shell code
or command-line arguments. Temporary SSH keys and Docker login configuration are
removed on exit. Do not enable shell tracing or print expanded `docker compose
config`: expanded config includes application secrets. Use `config --quiet` instead.

Deployments are serialized and are not cancelled mid-migration. The job pulls the
image, starts PostgreSQL, runs the new image's migration, and only on success
replaces web and waits for health. Caddy is started when the `tls` profile is
enabled. Failed migration leaves the old web container running. There is no
automatic rollback after migration or a failed web healthcheck; inspect the run
and container state. Approve only the intended revision, since an older CI run
can finish after a newer one.

Actions are pinned to verified upstream commit SHAs, with release versions in
comments. Update them through reviewed changes. Base-image major tags are still
mutable; pin reviewed image digests if required by your operations policy.
The publish job also boots the exact published image with disposable PostgreSQL
through Compose and checks migrations and HTTP health before deployment is eligible.

## Operations

Run commands from the VPS deployment directory. After a successful deployment:

```sh
docker compose --env-file .env --env-file .deploy.env ps
docker compose --env-file .env --env-file .deploy.env logs --tail=100 web migrate
```

For a manual update or password rotation, use the same migration-before-web order
as CI. Set `.deploy.env` to a previously published, reviewed image when updating
manually; keep the digest. Do not run the following concurrently with deployment.

```sh
docker compose --env-file .env --env-file .deploy.env pull web migrate
docker compose --env-file .env --env-file .deploy.env run --rm migrate
# Only proceed if the migration command succeeded.
docker compose --env-file .env --env-file .deploy.env up -d --no-deps --wait web
```

Schedule the migration command daily, serializing it with deployments. In addition
to migrations/admin synchronization, it deletes expired sessions, expired rate
limits, and activity older than 180 days. Environment admin credentials must stay
configured. Changing `POSTGRES_PASSWORD` in `.env` does not rotate a password in
an existing PostgreSQL volume: perform a coordinated database-role password change
and update the environment during a maintenance window.

## Backup And Restore

Back up before migrations and on a regular schedule. The following are Bash
commands on the VPS; use a restricted directory and encrypt/offsite the resulting
dump. Database backups contain personal data and live invitation/session material.
Back up the VPS `.env` separately in an encrypted secrets store and retain the
deployed image digest/config revision. Monitor backup failures and test restores.

```sh
umask 077
mkdir -p backups
docker compose --env-file .env --env-file .deploy.env exec -T db \
  pg_dump -U splatify -d splatify -Fc > "backups/splatify-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Restore during a maintenance window, preferably first into an isolated replacement
database/VPS. This command **replaces database contents**; verify the dump and target
first, and take a fresh backup. Stop all app writers and scheduled migrations.

```sh
docker compose --env-file .env --env-file .deploy.env stop caddy web
docker compose --env-file .env --env-file .deploy.env exec -T db \
  pg_restore -U splatify -d splatify --clean --if-exists --no-owner --single-transaction \
  < backups/CHOSEN-BACKUP.dump
# Only proceed after a successful restore; select a compatible image first.
docker compose --env-file .env --env-file .deploy.env run --rm migrate
docker compose --env-file .env --env-file .deploy.env up -d --no-deps --wait web
# With bundled TLS enabled:
docker compose --env-file .env --env-file .deploy.env up -d --no-deps caddy
```

Never use `docker compose down -v` unless intentionally deleting the database and
TLS state. Image rollback alone cannot undo a schema change: use backwards-compatible
migrations, or restore a tested backup with its matching image in a maintenance
window. A failed deployment can leave `.deploy.env.next` describing the attempted
image; `.deploy.env` records only the last deployment that completed successfully.

## Limitations

This is a single-VPS setup, not high availability or zero-downtime deployment.
Database storage is not encrypted by the application; use encrypted disks and
backups. Container healthchecks report health but do not automatically restart an
unhealthy running process. Add external uptime monitoring and backup alerts.
Accountless edit access depends on the browser cookie or saved personal edit link.
Private links are not end-to-end encrypted and are visible to the server operator.
There is no email verification, email recovery, or claim of verified guest identity.
Database-backed rate limits are not a substitute for network-level abuse protection.
Application caps include 1,000 total guests per event, 100 listed/owned events,
100 schedule/gear/announcement items, and 50 polls per event. Integration tests do
not replace browser tests for authentication, cookies, ownership, and invitations.
The UI is under active development; verify the complete browser journey and health
endpoint before opening a production deployment to users.
