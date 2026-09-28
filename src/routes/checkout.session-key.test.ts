/**
 * T5 fix round: custom-host checkout (`src/routes/checkout.tsx`,
 * `microscrop.shop/checkout`) retained the exact pre-fix defect — a fresh
 * `idempotencyKey` per mount, no session persistence, no rotation — so
 * refresh+resubmit duplicates orders there too.
 *
 * RED: this file fails against the pre-fix route (fresh `useMemo` key, no
 * session helpers, no rotation). GREEN: the route reuses the shared
 * `src/lib/payment-keys.ts` helpers, same as `store.$slug.checkout.tsx`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SRC = readFileSync("src/routes/checkout.tsx", "utf8");

describe("custom-host checkout session key", () => {
  it("reuses the shared session-key helpers (no duplicated key logic)", () => {
    expect(SRC).toContain("getCheckoutSessionKey");
    expect(SRC).toContain("clearCheckoutSessionKey");
    expect(SRC).toContain("@/lib/payment-keys");
    expect(SRC).not.toContain("function getCheckoutSessionKey");
    expect(SRC).not.toContain("function clearCheckoutSessionKey");
  });

  it("does not mint a fresh idempotency key per mount (refresh+resubmit replays)", () => {
    expect(SRC).not.toContain("const idempotencyKey = useMemo");
    expect(SRC).toContain("useState(() => getCheckoutSessionKey(slug))");
  });

  it("rotates the session key after successful placement", () => {
    const onSuccess = SRC.slice(SRC.indexOf("onSuccess"));
    expect(onSuccess).toContain("clearCheckoutSessionKey(slug)");
  });
});
