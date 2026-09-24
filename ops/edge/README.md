# Live edge (bd-primary-1) — source-of-truth map

Captured 2026-09-24. Files in this dir are verbatim ports of the live configs
(see header in each file for re-port rules). What is deliberately NOT here:
PEM/key contents (`/etc/haproxy/certs/` — names only below), `.env` secrets,
`sibling-project` app code.

## Traffic path (live)

```
:443 haproxy (static PEMs, TLS terminates here)
 ├─ known hosts (framique/framebase/supabase/shield/que ACLs)
 │    → 127.0.0.1:4443 openresty  (primary, host process)
 │    → 127.0.0.1:4444 caddy      (backup if openresty fails health checks)
 └─ everything else, incl. merchant custom domains
      → 127.0.0.1:4443 openresty  (no X-Forwarded-Proto set on this path)
:80  openresty/Kong build (Supabase gateway; not Framique ingress)
app  systemd framique.service → node .output/server/index.mjs on :3200
     (ops/systemd/framique.service; env from /opt/frame28/.env)
cron host root crontab → POST /api/public/cron/domains every 20 min
     (secret from the same .env at runtime; see task notes 2026-09-24)
```

## Cert inventory (`/etc/haproxy/certs/`, names only)

`bitcart`/`demo.ghostmaster.shop`, `framebase`/`framique.qubickle.com`,
`microscrop.shop` (merchant custom domain, placed 2026-09-19, mode 600),
`qbx`/`qbx.qubickle.com`, `que.qubickle.com`, `shield.ghostmaster.shop`,
`supabase.flamelearner.com`. New merchant domains land here by operator drop
today — there is no ACME writer yet (see gap below).

## Design gap (tracked, not hidden)

`ops/routing/nginx-blue-green.conf` + `ops/nomad/openresty-edge.nomad` +
`ops/docker/Dockerfile.openresty` describe a lua-resty-acme autossl edge that
is **not** what terminates 443 today. An autossl file-store with past orders
exists on disk (`/var/lib/openresty/ssl/certs/`) but no autossl process runs.
Until the ingress migration lands: hook URL stays unset, verified domains rest
at `dns_verified`/`awaiting_edge` (fail closed), and the app observes issuance
(`reconcileIssuance`) rather than receiving callbacks. Out of repo scope:
`/usr/local/bin/refresh-supabase-tls.sh` (supabase-que project), sibling
Caddy sites, `omniroute` container.

## Verified 2026-09-24

- Backup systemd units live == repo byte-for-byte (md5 match ×5).
- `haproxy -c` equivalent eyeball: ACL/backend names match running `ss`
  listeners (:443 haproxy, :4443 openresty, :4444 caddy).
