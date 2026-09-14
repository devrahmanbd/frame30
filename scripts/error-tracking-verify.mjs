#!/usr/bin/env node
/**
 * Phase 12 — error tracking verifier.
 *
 * Reads the live self-hosted stack back and proves the error path works end to
 * end. Run it on the host that has GLITCHTIP_DSN / SENTRY_DSN configured:
 *
 *   node scripts/error-tracking-verify.mjs            # config + reachability
 *   node scripts/error-tracking-verify.mjs --send     # also send a test event
 *
 * Exit code 0 means every configured backend is reachable and accepted the
 * probe. Exit code 1 means a human has to look.
 */
const SEND = process.argv.includes("--send");

const checks = [];
const record = (name, ok, detail = "") => {
  checks.push({ name, ok, detail });
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
};

function parseDsn(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const projectId = url.pathname.replace(/^\/+/, "");
    if (!projectId || !url.username) return null;
    return {
      envelope: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      health: `${url.protocol}//${url.host}/_health/`,
      auth: `Sentry sentry_version=7, sentry_client=framique/1.0, sentry_key=${url.username}`,
      raw,
    };
  } catch {
    return null;
  }
}

const targets = [
  { name: "glitchtip", dsn: parseDsn(process.env.GLITCHTIP_DSN) },
  { name: "sentry", dsn: parseDsn(process.env.SENTRY_DSN) },
].filter((t) => t.dsn);

if (targets.length === 0) {
  process.stdout.write(
    "No error backend configured (GLITCHTIP_DSN / SENTRY_DSN unset).\n" +
      "That is a valid state for a dev box, but Phase 12 acceptance needs at least one.\n",
  );
  process.exit(1);
}

async function timed(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

for (const { name, dsn } of targets) {
  try {
    const res = await timed(dsn.health);
    record(`${name}: health endpoint`, res.ok, `HTTP ${res.status}`);
  } catch (err) {
    record(`${name}: health endpoint`, false, String(err?.message ?? err));
  }

  if (!SEND) continue;

  const eventId = crypto.randomUUID().replace(/-/g, "");
  const payload = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: "javascript",
    logger: "framique-verify",
    level: "error",
    environment: process.env.ERROR_ENVIRONMENT ?? process.env.SENTRY_ENVIRONMENT ?? "preview",
    release: process.env.ERROR_RELEASE ?? "verify",
    message: "Framique phase-12 verification error (no personal data)",
    fingerprint: ["verify", "phase-12"],
    tags: { scope: "ops.verify", verification: "true" },
    exception: {
      values: [
        {
          type: "VerificationError",
          value: "Framique phase-12 verification error (no personal data)",
          stacktrace: {
            frames: [
              { filename: "scripts/error-tracking-verify.mjs", function: "main", lineno: 1, in_app: true },
            ],
          },
          mechanism: { handled: true },
        },
      ],
    },
  };
  const body = JSON.stringify(payload);
  const envelope =
    `${JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn: dsn.raw })}\n` +
    `${JSON.stringify({ type: "event", length: body.length })}\n${body}\n`;

  try {
    const res = await timed(dsn.envelope, {
      method: "POST",
      headers: { "content-type": "application/x-sentry-envelope", "x-sentry-auth": dsn.auth },
      body: envelope,
    });
    record(`${name}: accepted test event`, res.ok, `HTTP ${res.status} event_id=${eventId}`);
  } catch (err) {
    record(`${name}: accepted test event`, false, String(err?.message ?? err));
  }
}

// Alert bridge: only meaningful when a secret and an app URL are configured.
const appUrl = process.env.APP_INTERNAL_URL;
if (SEND && appUrl && process.env.ERROR_ALERT_SECRET) {
  try {
    const res = await timed(`${appUrl.replace(/\/$/, "")}/api/public/error-alert`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-error-alert-secret": process.env.ERROR_ALERT_SECRET,
      },
      body: JSON.stringify({
        title: "Framique phase-12 verification issue",
        level: "error",
        project: "framique",
        source: "glitchtip",
        url: `${process.env.GLITCHTIP_DOMAIN ?? "http://localhost:8000"}/issues`,
      }),
    });
    record("alert bridge: forwards to Alertmanager", res.status === 202, `HTTP ${res.status}`);
  } catch (err) {
    record("alert bridge: forwards to Alertmanager", false, String(err?.message ?? err));
  }
}

const failed = checks.filter((c) => !c.ok);
process.stdout.write(`\n${checks.length - failed.length}/${checks.length} checks passed.\n`);
if (SEND) {
  process.stdout.write(
    "Now open each backend UI and confirm the issue shows a readable stack trace and no personal data.\n",
  );
}
process.exit(failed.length === 0 ? 0 : 1);
