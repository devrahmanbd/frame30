/**
 * QUBICKLE Rule 22 — security tests exercise the attack path, not just the
 * happy path: cross-merchant activation/status changes, ledger integer
 * precision on paid installs. (Missing-auth wiring is pinned statically in
 * cms-authz.contract.test.ts through the real requirePermission symbol;
 * RLS text is pinned in marketplace-qubickle-contract.test.ts; zip-slip,
 * expiry, replay and concurrency live in their own suites.)
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

const { activateTheme } = await import("./themes/appearance.server");
const { installListing, setInstallStatus } =
  await import("./marketplace-install.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const FOREIGN = "11111111-1111-4111-8111-111111111111";
const ACTOR = "99999999-9999-4999-8999-999999999999";
const THEME = "44444444-4444-4444-4444-444444444444";
const LISTING = "55555555-5555-4555-8555-555555555555";

beforeEach(() => recorder.reset());

describe("Rule 22 — cross-merchant attack paths fail closed", () => {
  it("a foreign merchant cannot activate my theme", async () => {
    const db = fakeDb({
      tables: {
        store_themes: [
          {
            id: THEME,
            merchant_id: MERCHANT,
            name: "Mine",
            is_active: false,
            source_listing_slug: null,
            source_install_id: null,
          },
        ],
        theme_versions: [
          {
            id: "v-live",
            merchant_id: MERCHANT,
            theme_id: THEME,
            version: 1,
            status: "published",
          },
        ],
        theme_drafts: [],
        theme_audit: [],
      },
    });
    await expect(
      activateTheme(db.asClient(), FOREIGN, THEME, ACTOR),
    ).rejects.toMatchObject({ code: "theme.missing" });
    expect(db.rows("store_themes").find((r) => r.id === THEME)!.is_active).toBe(
      false,
    );
  });

  it("a foreign merchant cannot flip my install status", async () => {
    const db = fakeDb({
      tables: {
        marketplace_installs: [
          {
            id: "inst-1",
            merchant_id: MERCHANT,
            kind: "widget",
            listing_slug: "w",
            status: "installed",
            is_trial: false,
          },
        ],
        store_themes: [],
        plugin_state: [],
        activity_log: [],
      },
    });
    await expect(
      setInstallStatus(db.asClient(), FOREIGN, "inst-1", "paused", ACTOR),
    ).rejects.toThrow("market_install_not_found");
    expect(
      db.rows("marketplace_installs").find((r) => r.id === "inst-1")!.status,
    ).toBe("installed");
  });

  it("a paid install posts integer-minor ledger rows with an exact split", async () => {
    const db = fakeDb({
      tables: {
        marketplace_themes: [
          {
            id: LISTING,
            name: "Paid theme",
            slug: "paid-theme",
            version: "2.0.0",
            status: "active",
            seller_merchant_id: "seller",
            price_minor_int: 999,
            currency_code: "BDT",
            trial_allowed: false,
            compatible_versions: [],
            install_count: 3,
            manifest: { permissions: ["render_storefront"] },
          },
        ],
        marketplace_versions: [],
        marketplace_installs: [],
        wallet_ledger_entries: [],
        store_themes: [],
        theme_versions: [],
        theme_drafts: [],
        theme_audit: [],
        activity_log: [],
      },
    });
    const out = await installListing(db.asClient(), MERCHANT, {
      kind: "theme",
      listingId: LISTING,
      trial: false,
      idempotencyKey: "paid-key-1",
      versionId: null,
      grantedScopes: ["render_storefront"],
      consentedBy: ACTOR,
    });
    expect(out.replayed).toBe(false);
    const entries = db.rows("wallet_ledger_entries");
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    // Integer minor units only — no floats stored, transmitted, or computed.
    for (const field of [
      "gross_minor_int",
      "seller_minor_int",
      "platform_minor_int",
    ]) {
      expect(Number.isInteger(entry[field])).toBe(true);
    }
    expect(entry.gross_minor_int).toBe(999);
    expect(entry.seller_minor_int + entry.platform_minor_int).toBe(
      entry.gross_minor_int,
    );
    expect(entry.idempotency_key).toBe("paid-key-1");
  });
});
