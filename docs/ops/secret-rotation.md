# Secret Rotation Runbook

**Classification:** Ops-restricted (platform owner + on-call lead only)  
**Review cadence:** Quarterly or immediately after any suspected exposure.  
**Audit trail:** Every rotation step must be logged in the owner audit trail (`/root/audit`) with action `secret_rotation`, the secret class, actor, and timestamp.

---

## 1. Gateway Webhook Secrets

Each merchant gateway account holds a `webhook_secret` stored encrypted in `gateway_accounts.webhook_secret`. A rotation requires dual approval (two platform admins) per the four-eyes policy.

### Procedure

1. **Initiate** via `/root/gateway` → Gateway Accounts → Select account → "Rotate webhook secret".
2. The UI generates a new secret and begins the **dual-sign grace window** (30 minutes) during which BOTH old and new secrets are accepted by the HMAC verifier (`gateway_apply_webhook` RPC).
3. **Update the gateway provider** (bKash / Nagad / SSLCOMMERZ admin console) with the new webhook secret before the grace window expires.
4. At grace window expiry, the old secret is invalidated automatically by the rotation sweep cron.
5. Confirm in the owner audit trail that `secret_rotation:gateway_webhook` has been logged.

### Failure mode
If the provider update fails before the grace window closes, extend the window by re-triggering the rotation. Do **not** close the window before the provider is updated — this would drop all incoming webhook events.

---

## 2. Supabase Service Role Key

The `SUPABASE_SERVICE_ROLE_KEY` is used only in server-side `supabaseAdmin` (never client-side). Rotation requires a deploy with zero downtime.

### Procedure

1. In the Supabase dashboard → Settings → API → **Reveal service role key**.
2. Generate a new service role key (the old one remains valid during the 5-minute overlap window in Supabase).
3. Update the platform secret store:
   ```bash
   # Production (Fly.io / self-hosted equivalent)
   flyctl secrets set SUPABASE_SERVICE_ROLE_KEY="<new-key>" --app framique-prod
   # Or for Docker / Bun environment:
   # Update .env.production and re-deploy
   ```
4. Trigger a **blue/green canary deploy** — the green slot picks up the new key while blue still serves on the old key. Once green is healthy, promote and drain blue.
5. Revoke the old service role key in Supabase.
6. Log `secret_rotation:supabase_service_role` in the owner audit trail.

---

## 3. Supabase JWT Secret (GoTrue)

Rotating the JWT secret invalidates **all active sessions** — all merchants will be logged out.

### Procedure

**Announce:** Post a maintenance window notice at least 24 hours before. Use `/root/settings` → "Announce maintenance" to notify merchants.

1. In Supabase dashboard → Settings → Auth → JWT secret → Generate new secret.
2. Update `SUPABASE_JWT_SECRET` in the platform secret store.
3. Deploy immediately — old JWTs are invalid after this point.
4. Log `secret_rotation:supabase_jwt` in owner audit trail with the maintenance window ID.
5. Monitor `/api/public/metrics` for a spike in `framique_auth_events_total{outcome="error"}` — expected briefly as sessions expire.

---

## 4. Platform API Keys (Merchant-issued)

Merchant API keys in `api_keys` can be rotated by the merchant via `/dashboard/settings/api` or by a platform admin via `/root/tenancy`.

### Procedure (merchant self-service)
1. Dashboard → Settings → API Keys → "Rotate key".
2. A new key is issued with a 24-hour overlap window. Integrations should be updated before the window expires.
3. The old key is auto-expired by the rotation sweep cron.

### Procedure (platform admin force-rotation)
1. `/root/tenancy` → Select merchant → Developer → "Force rotate API keys".
2. This writes an immediate expiry on all active keys for the merchant with audit reason `platform_force_rotation`.
3. The merchant receives an in-app notification and email to re-issue keys.

---

## 5. Redis / Cache Layer Secrets

The Redis password (`REDIS_URL`) must be rotated carefully to avoid cache stampede.

### Procedure

1. Configure the new Redis password on the Redis server (AUTH command or via managed Redis dashboard), keeping the old password valid for 10 minutes.
2. Update `REDIS_URL` in the platform secret store.
3. Perform a rolling restart of all Nitro workers.
4. Remove the old password from Redis after all workers have reconnected.
5. Log `secret_rotation:redis` in owner audit trail.

---

## 6. Courier Webhook Credentials

Each courier integration (Steadfast, RedX, Pathao, Paperfly, eCourier, Sundarban) has a per-merchant webhook secret stored in `courier_accounts.webhook_secret`.

### Procedure
Same as gateway webhook rotation (§1): generate new secret, update in courier admin portal, keep old secret alive in the dual-sign grace window, expire old secret after confirmation.

---

## 7. ACME / TLS Wildcard Certificates

Let's Encrypt certificates auto-renew via the OpenResty `lua-resty-acme` integration. No manual rotation is required unless the ACME account key is compromised.

### Compromised ACME account key
1. Revoke all issued certificates via ACME: `acme.sh --revoke --domain framique.store --ecc`.
2. Generate a new ACME account key.
3. Re-issue certificates for all active custom domains (triggers automatically via the next verification sweep in `/api/public/cron/domains`).

---

## 8. Emergency: Suspected Full Compromise

If you suspect a service role key, JWT secret, or platform key has leaked:

1. **Platform kill-switch**: `/root/platform` → "Emergency lockdown" — freezes all merchant mutations.
2. Rotate **all** secrets in this order: JWT secret → Service role key → Gateway secrets → API keys → Redis.
3. Force-logout all sessions: Supabase dashboard → Auth → "Invalidate all tokens".
4. Review the owner audit trail for the 72-hour window before the suspected leak.
5. File an incident report and notify affected merchants if PII was accessible.

---

## Audit Assertion Checklist

After every rotation, verify:
- [ ] Rotation event logged in `/root/audit` with `actor`, `secret_class`, `timestamp`, `reason`
- [ ] Prometheus counter `framique_secret_rotation_total{class="..."}` incremented
- [ ] No spike in `framique_auth_events_total{outcome="error"}` beyond expected post-rotation transient
- [ ] Gateway test webhook fires and is accepted by the new secret
- [ ] CI gates pass (`bun run gates`)
