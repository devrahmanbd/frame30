/**
 * Collection rename: validated slug edits with automatic 301s.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

const rec = vi.hoisted(() => ({ holder: null as any }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const { renameCollection } = await import("./catalog.server");

const MERCHANT = "33333333-3333-3333-3333-333333333333";
const OTHER = "44444444-4444-4444-4444-444444444444";
const CID = "55555555-5555-5555-5555-555555555555";

function renameDb() {
  return fakeDb({
    tables: {
      collections: [
        { id: CID, merchant_id: MERCHANT, name: "Women", slug: "women" },
        {
          id: "66666666-6666-6666-6666-666666666666",
          merchant_id: MERCHANT,
          name: "Men",
          slug: "men",
        },
      ],
      url_redirects: [],
    },
    rpc: (fn) =>
      fn === "has_merchant_role"
        ? { data: true, error: null }
        : { data: null, error: { message: `rpc_not_stubbed:${fn}` } },
  });
}

beforeEach(() => recorder.reset());

describe("renameCollection", () => {
  it("rejects an invalid slug and writes nothing", async () => {
    const db = renameDb();
    await expect(
      renameCollection(db.asClient(), {
        merchantId: MERCHANT,
        collectionId: CID,
        slug: "Bad Slug!!",
      }),
    ).rejects.toThrow();
    expect(
      db.rows("collections").find((r: any) => r.id === CID)!.slug,
    ).toBe("women");
    expect(db.rows("url_redirects")).toHaveLength(0);
  });

  it("rejects a duplicate slug and writes nothing", async () => {
    const db = renameDb();
    await expect(
      renameCollection(db.asClient(), {
        merchantId: MERCHANT,
        collectionId: CID,
        slug: "men",
      }),
    ).rejects.toThrow();
    expect(
      db.rows("collections").find((r: any) => r.id === CID)!.slug,
    ).toBe("women");
    expect(db.rows("url_redirects")).toHaveLength(0);
  });

  it("renames and writes a 301 from the old collection URL", async () => {
    const db = renameDb();
    const out: any = await renameCollection(db.asClient(), {
      merchantId: MERCHANT,
      collectionId: CID,
      name: "Women Edit",
      slug: "ladies",
    });
    expect(out.slug).toBe("ladies");
    expect(out.redirect).toBe(true);
    const row = db.rows("collections").find((r: any) => r.id === CID)!;
    expect(row.name).toBe("Women Edit");
    expect(row.slug).toBe("ladies");
    const rules = db.rows("url_redirects");
    expect(rules).toHaveLength(1);
    expect(rules[0]!).toMatchObject({
      merchant_id: MERCHANT,
      from_path: "/c/women",
      to_path: "/c/ladies",
      status_code: 301,
    });
  });

  it("edits the name alone without redirect noise", async () => {
    const db = renameDb();
    const out: any = await renameCollection(db.asClient(), {
      merchantId: MERCHANT,
      collectionId: CID,
      name: "Women Edit",
    });
    expect(out.redirect).toBe(false);
    expect(db.rows("url_redirects")).toHaveLength(0);
  });

  it("cannot touch another merchant's collection (deny)", async () => {
    const db = renameDb();
    await expect(
      renameCollection(db.asClient(), {
        merchantId: OTHER,
        collectionId: CID,
        slug: "ladies",
      }),
    ).rejects.toThrow();
    expect(
      db.rows("collections").find((r: any) => r.id === CID)!.slug,
    ).toBe("women");
  });
});
