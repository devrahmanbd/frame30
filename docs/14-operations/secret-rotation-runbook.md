# Secret Rotation Runbook (BUILD.md §2.9 [A])

> Every rotation writes an append-only audit row (actor, before, after, reason).
> Secrets are read inside handlers only — never at module scope, never in logs,
> error bodies, or metric labels (`AGENTS.md` architecture rules).

## Routine rotation (scheduled, no incident)

| Secret                                 | Where it lives                                              | How to rotate                                                                                    | Grace behavior                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Per-merchant webhook secret            | `webhook_endpoints` (`secret_prefix` shown, plaintext once) | `rotateWebhookSecret()` (`src/lib/webhooks.server.ts:161`)                                       | Old secret keeps verifying through the grace window (dual-sign); deliveries flip to the new secret immediately |
| OAuth client secret                    | `oauth_clients`                                             | `rotateClientSecret()` (`src/lib/oauth.server.ts:202`)                                           | Same dual window; refresh tokens rotate on every use regardless                                                |
| Merchant API keys                      | API key lifecycle surface (`/dashboard/developers`)         | Create replacement → verify traffic on new key → revoke old                                      | Overlap window monitored; revocation is instant                                                                |
| Gateway credentials (bKash/Nagad/bank) | Provider gate vault, step-up protected                      | Rotate in provider dashboard first, then update vault via credential-edit (step-up MFA required) | Keep old credential until first successful live callback on the new one                                        |
| Supabase JWT / service keys            | Supabase dashboard → app env (`SUPABASE_*`)                 | Rotate in dashboard, rolling-restart app (Blue/Green: new key to GREEN, canary, promote)         | Zero-downtime via slot swap; never commit keys to git                                                          |
| SMTP / Resend keys                     | Mailer config                                               | Same slot-swap as Supabase keys                                                                  | Test-send before promote                                                                                       |

Cadence: webhook + OAuth client secrets every 90 days (or on staff offboarding);
platform keys every 180 days; gateway credentials per provider policy.
Track due dates as ops checklist items — no secret lives forever.

## Leak fast-path (suspected exposure — e.g. pasted in chat, committed to git)

1. **Revoke first**: kill the exposed credential at the provider / in the
   vault immediately. Do not wait for a replacement.
2. **Replace**: issue the new secret through the rotation function above
   (keeps audit + grace semantics intact).
3. **Scrub**: purge the secret from git history (`git filter-repo`), logs
   (Loki retention delete), and screenshots. Rotate anything co-located
   (same file/env block) — assume blast radius.
4. **Verify**: `bun run secrets:scan` clean; confirm live traffic on the new
   secret (metrics: no auth-error spike); confirm old secret 401s.
5. **Audit**: append-only rows for revoke + replace with reason
   `suspected-exposure`; file a platform incident note.

## Verification

- `bun run scan:secrets` (CI-enforced per push via `.github/workflows/gates.yml`)
- `secret_rotated_at` columns on `webhook_endpoints` / `oauth_clients` prove
  recency; alert if any production secret exceeds its cadence.
