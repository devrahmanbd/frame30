/**
 * lang-boot cookie contract (origin-split audit pin).
 *
 * `framique.lang` is visitor state, never auth — but it rides on every request
 * on the origin, so its flags are pinned: explicit `Path=/`, `SameSite=Lax`,
 * and `Secure` exactly when serving HTTPS (parity: local HTTP dev is never
 * weakened by an un-settable Secure flag). The reader half pins the HARD RULE:
 * a pre-change cookie header still resolves.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  LANG_COOKIE,
  langFromCookieHeader,
  persistLangCookie,
  readClientBootLang,
  resolveRequestLang,
} from "./lang-boot";

const savedDocument = (globalThis as Record<string, unknown>)["document"];
const savedWindow = (globalThis as Record<string, unknown>)["window"];

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  if (savedDocument === undefined) delete g["document"];
  else g["document"] = savedDocument;
  if (savedWindow === undefined) delete g["window"];
  else g["window"] = savedWindow;
});

function stubBrowser(protocol: string) {
  const g = globalThis as Record<string, unknown>;
  let jar = "";
  const written: string[] = [];
  g["window"] = { location: { protocol, search: "" } };
  g["document"] = {
    get cookie() {
      return jar;
    },
    set cookie(value: string) {
      written.push(value);
      // Minimal jar: keep the latest value per name like a browser would.
      const [pair] = value.split(";");
      const eq = pair!.indexOf("=");
      const name = pair!.slice(0, eq).trim();
      const rest = jar
        .split(";")
        .map((p) => p.trim())
        .filter((p) => p && !p.startsWith(`${name}=`));
      rest.push(pair!.trim());
      jar = rest.join("; ");
    },
    documentElement: { lang: "en" },
  };
  return {
    written,
    seedJar: (v: string) => {
      jar = v;
    },
  };
}

describe("langFromCookieHeader / resolveRequestLang (old sessions keep working)", () => {
  it("reads a legacy framique.lang cookie", () => {
    expect(langFromCookieHeader(`${LANG_COOKIE}=bn`)).toBe("bn");
    expect(langFromCookieHeader(`foo=1; ${LANG_COOKIE}=en; x=y`)).toBe("en");
  });

  it("rejects missing and unexpected values, defaulting to en", () => {
    expect(langFromCookieHeader(null)).toBeNull();
    expect(langFromCookieHeader("")).toBeNull();
    expect(langFromCookieHeader(`${LANG_COOKIE}=fr`)).toBeNull();
    expect(resolveRequestLang({ search: "", cookieHeader: null })).toBe("en");
  });

  it("keeps ?lang= winning over the cookie", () => {
    expect(
      resolveRequestLang({
        search: "?lang=bn",
        cookieHeader: `${LANG_COOKIE}=en`,
      }),
    ).toBe("bn");
  });
});

describe("persistLangCookie flags", () => {
  it("emits Path=/ + SameSite=Lax without Secure on http (dev parity)", () => {
    const { written } = stubBrowser("http:");
    persistLangCookie("bn");
    expect(written).toHaveLength(1);
    const [cookie] = written;
    expect(cookie).toContain(`${LANG_COOKIE}=bn`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
    expect(cookie).not.toContain("Domain=");
  });

  it("adds Secure on https without dropping Path/SameSite", () => {
    const { written } = stubBrowser("https:");
    persistLangCookie("en");
    expect(written).toHaveLength(1);
    const [cookie] = written;
    expect(cookie).toContain(`${LANG_COOKIE}=en`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(cookie).not.toContain("Domain=");
  });

  it("round-trips: a written cookie is readable by the boot reader", () => {
    const ctx = stubBrowser("https:");
    persistLangCookie("bn");
    expect(readClientBootLang()).toBe("bn");
    expect(ctx.written).toHaveLength(1);
  });

  it("an old cookie (no Secure flag) still boots the locale", () => {
    const ctx = stubBrowser("http:");
    ctx.seedJar(`${LANG_COOKIE}=bn`);
    expect(readClientBootLang()).toBe("bn");
  });
});
