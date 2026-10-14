import type { Page } from "@playwright/test";

/**
 * Shared E2E helpers. Hermetic by construction: everything resolves to the
 * local dev server; nothing here names an external host.
 */

export const DEV_DEFAULT_PORT = 3000;

/** Base URL for the run. E2E_BASE_URL wins; else localhost:<E2E_PORT|3000>. */
export function resolveBaseURL(): string {
  const fromEnv = process.env.E2E_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  const port = Number(process.env.E2E_PORT ?? DEV_DEFAULT_PORT);
  const safe =
    Number.isInteger(port) && port > 0 && port < 65536
      ? port
      : DEV_DEFAULT_PORT;
  return `http://localhost:${safe}`;
}

/** Port the config webServer should listen on for a given baseURL. */
export function resolvePort(baseURL: string): number {
  try {
    const url = new URL(baseURL);
    const explicit = Number(url.port);
    if (Number.isInteger(explicit) && explicit > 0 && explicit < 65536)
      return explicit;
  } catch {
    // Fall through to the env/default below.
  }
  const fromEnv = Number(process.env.E2E_PORT ?? DEV_DEFAULT_PORT);
  return Number.isInteger(fromEnv) && fromEnv > 0 && fromEnv < 65536
    ? fromEnv
    : DEV_DEFAULT_PORT;
}

export const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

export function hostnameOf(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export type ResponseRecord = { url: string; status: number };

/**
 * Network collector: records every response status + failed request for a
 * page. Attach before navigation; call dispose() in afterAll (or rely on
 * page close — dispose just detaches listeners explicitly).
 */
export class NetworkCollector {
  readonly responses: ResponseRecord[] = [];
  readonly failed: string[] = [];
  readonly hosts = new Set<string>();
  private readonly page: Page;
  private attached = false;

  private readonly onResponse = (res: {
    url(): string;
    status(): number;
  }): void => {
    const url = res.url();
    this.responses.push({ url, status: res.status() });
    const host = hostnameOf(url);
    if (host) this.hosts.add(host);
  };

  private readonly onFailed = (req: { url(): string }): void => {
    this.failed.push(req.url());
  };

  private readonly onSeen = (req: { url(): string }): void => {
    const host = hostnameOf(req.url());
    if (host) this.hosts.add(host);
  };

  constructor(page: Page) {
    this.page = page;
  }

  attach(): this {
    if (!this.attached) {
      this.page.on("response", this.onResponse as never);
      this.page.on("requestfailed", this.onFailed as never);
      this.page.on("request", this.onSeen as never);
      this.attached = true;
    }
    return this;
  }

  dispose(): void {
    if (this.attached) {
      this.page.off("response", this.onResponse as never);
      this.page.off("requestfailed", this.onFailed as never);
      this.page.off("request", this.onSeen as never);
      this.attached = false;
    }
  }

  nonLocalHosts(): string[] {
    return [...this.hosts].filter((h) => !LOCAL_HOSTNAMES.has(h));
  }

  /** Responses that actually completed from outside loopback. */
  externalResponses(): ResponseRecord[] {
    return this.responses.filter((r) => {
      const host = hostnameOf(r.url);
      return host !== null && !LOCAL_HOSTNAMES.has(host);
    });
  }

  withStatus(status: number): ResponseRecord[] {
    return this.responses.filter((r) => r.status === status);
  }
}

/** Unique http(s) image URLs currently in the document. */
export async function documentImageUrls(page: Page): Promise<string[]> {
  const srcs = await page
    .locator("img[src]")
    .evaluateAll((els) =>
      els.map((el) => (el as HTMLImageElement).getAttribute("src") ?? ""),
    );
  const out: string[] = [];
  const seen = new Set<string>();
  for (const src of srcs) {
    if (!src || src.startsWith("data:") || src.startsWith("blob:")) continue;
    let absolute = src;
    try {
      absolute = new URL(src, page.url()).href;
    } catch {
      continue;
    }
    if (!seen.has(absolute)) {
      seen.add(absolute);
      out.push(absolute);
    }
  }
  return out;
}

/**
 * Hermetic enforcement: abort every http(s) request whose host is not
 * loopback BEFORE it touches the network, recording what was blocked.
 * The app legitimately references fonts/unsplash hosts in its markup;
 * blocking (not just observing) proves the suite needs no external
 * network to pass.
 */
export async function blockExternalRequests(
  page: Page,
  blocked: string[],
): Promise<void> {
  await page.route(/^https?:\/\//, (route) => {
    const host = hostnameOf(route.request().url());
    if (host !== null && !LOCAL_HOSTNAMES.has(host)) {
      blocked.push(route.request().url());
      void route.abort();
    } else {
      void route.continue();
    }
  });
}
