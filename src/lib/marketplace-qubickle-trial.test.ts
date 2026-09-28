/**
 * QUBICKLE H5 — trial expiry is enforced, not decorative.
 *
 * - Expired trials lapse (terminal `lapsed`, never a live status).
 * - setInstallStatus on an expired trial throws market_trial_expired.
 * - Re-installing under an expired trial's key throws market_trial_expired.
 * - The badge helper distinguishes live from expired trials.
 *
 * TDD RED-first.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const { setInstallStatus, lapseExpiredTrials, installListing } =
  await import("./marketplace-install.server");
const { isInstallLive, isLiveInstallStatus } =
  await import("./marketplace-badges");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const ACTOR = "99999999-9999-4999-8999-999999999999";
const TRIAL_INSTALL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PAST = new Date(Date.now() - 86_400_000).toISOString();
const FUTURE = new Date(Date.now() + 86_400_000).toISOString();

function trialDb(expiresAt: string, status = "trial") {
  return fakeDb({
    tables: {
      marketplace_installs: [
        {
          id: TRIAL_INSTALL,
          merchant_id: MERCHANT,
          kind: "widget",
          listing_slug: "trial-widget",
          status,
          is_trial: true,
          expires_at: expiresAt,
        },
      ],
      store_themes: [],
      plugin_state: [],
      activity_log: [],
    },
  });
}

beforeEach(() => recorder.reset());

describe("H5 — expired trials lapse and refuse", () => {
  it("lapseExpiredTrials parks past-due trials on terminal lapsed", async () => {
    const db = trialDb(PAST);
    const out = await lapseExpiredTrials(db.asClient(), MERCHANT, Date.now());
    expect(out.lapsed).toEqual([TRIAL_INSTALL]);
    expect(
      db.rows("marketplace_installs").find((r) => r.id === TRIAL_INSTALL)!
        .status,
    ).toBe("lapsed");
    expect(isLiveInstallStatus("lapsed")).toBe(false);
  });

  it("lapseExpiredTrials leaves live trials alone", async () => {
    const db = trialDb(FUTURE);
    const out = await lapseExpiredTrials(db.asClient(), MERCHANT, Date.now());
    expect(out.lapsed).toEqual([]);
    expect(
      db.rows("marketplace_installs").find((r) => r.id === TRIAL_INSTALL)!
        .status,
    ).toBe("trial");
  });

  it("setInstallStatus on an expired trial lapses it and throws", async () => {
    const db = trialDb(PAST);
    await expect(
      setInstallStatus(
        db.asClient(),
        MERCHANT,
        TRIAL_INSTALL,
        "installed",
        ACTOR,
      ),
    ).rejects.toThrow("market_trial_expired");
    expect(
      db.rows("marketplace_installs").find((r) => r.id === TRIAL_INSTALL)!
        .status,
    ).toBe("lapsed");
  });

  it("re-installing under an expired trial key throws instead of replaying", async () => {
    const db = fakeDb({
      tables: {
        marketplace_themes: [
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            name: "Trial theme",
            slug: "trial-theme",
            version: "1.0.0",
            status: "active",
            seller_merchant_id: "seller",
            price_minor_int: 5000,
            currency_code: "BDT",
            trial_allowed: true,
            compatible_versions: [],
            install_count: 0,
            manifest: {},
          },
        ],
        marketplace_versions: [],
        marketplace_installs: [
          {
            id: TRIAL_INSTALL,
            merchant_id: MERCHANT,
            kind: "theme",
            theme_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            listing_slug: "trial-theme",
            status: "trial",
            is_trial: true,
            expires_at: PAST,
            idempotency_key: "trial-key-9",
          },
        ],
        store_themes: [],
        theme_versions: [],
        theme_drafts: [],
        theme_audit: [],
        activity_log: [],
      },
    });
    await expect(
      installListing(db.asClient(), MERCHANT, {
        kind: "theme",
        listingId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        trial: true,
        idempotencyKey: "trial-key-9",
        versionId: null,
        grantedScopes: [],
        consentedBy: null,
      }),
    ).rejects.toThrow("market_trial_expired");
  });

  it("isInstallLive honours expiry while isLiveInstallStatus stays a status check", () => {
    expect(isLiveInstallStatus("trial")).toBe(true);
    expect(isInstallLive("trial", FUTURE, Date.now())).toBe(true);
    expect(isInstallLive("trial", PAST, Date.now())).toBe(false);
    expect(isInstallLive("installed", null, Date.now())).toBe(true);
    expect(isInstallLive("lapsed", null, Date.now())).toBe(false);
  });
});
