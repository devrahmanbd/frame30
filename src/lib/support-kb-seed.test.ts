import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  defaultCorpusDir,
  KB_CORPUS_SOURCE_TAG,
  KB_CORPUS_VERSION,
  KB_CORPUS_VERSION_TAG,
  KbCorpusError,
  loadCorpusDocs,
  parseCorpusFile,
  planSeed,
  seedPublicKb,
  type CorpusDoc,
  type ExistingDoc,
  type SaveDocFn,
} from "./support-kb-seed.server";
import type { SaveDocInput } from "./support-kb.server";

const SECRET_PATTERNS: RegExp[] = [
  /\bsb_secret_[A-Za-z0-9_-]{10,}/,
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9]{32,}/,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bxox[abprs]-[0-9A-Za-z-]{10,}/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\b(?:secret|password|passwd|api_?key|token)\s*[:=]\s*["'][A-Za-z0-9!@#$%^&*_+\-/]{16,}["']/i,
];

const PII_PATTERNS: RegExp[] = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  /01[3-9]\d{8}/,
  /\d{10,}/,
];

function stubFile(slug: string, overrides: Partial<CorpusDoc> = {}): CorpusDoc {
  return {
    slug,
    title: `Title ${slug}`,
    locale: "en",
    audience: "merchant",
    tags: ["test"],
    sourceUrl: "/test",
    status: "published",
    body:
      `Q: What is ${slug}? ` +
      "Answer body with enough words to pass the length gate. ".repeat(10),
    ...overrides,
  };
}

describe("R2 — public corpus validity", () => {
  it("ships 12–20 self-contained markdown files", async () => {
    const docs = await loadCorpusDocs(defaultCorpusDir());
    expect(docs.length).toBeGreaterThanOrEqual(12);
    expect(docs.length).toBeLessThanOrEqual(20);
  });

  it("every file carries title+locale+audience frontmatter matching its filename", async () => {
    const docs = await loadCorpusDocs(defaultCorpusDir());
    for (const doc of docs) {
      expect(doc.title.length, `${doc.slug}:title`).toBeGreaterThan(0);
      expect(["en", "bn"], `${doc.slug}:locale`).toContain(doc.locale);
      expect(
        ["merchant", "developer", "platform"],
        `${doc.slug}:audience`,
      ).toContain(doc.audience);
      expect(doc.slug.endsWith(`-${doc.locale}`), `${doc.slug}:suffix`).toBe(
        true,
      );
      expect(doc.body.includes("?"), `${doc.slug}:question`).toBe(true);
      expect(doc.body.length, `${doc.slug}:length`).toBeGreaterThanOrEqual(200);
    }
  });

  it("corpus contains no secrets and no PII", async () => {
    const docs = await loadCorpusDocs(defaultCorpusDir());
    for (const doc of docs) {
      const text = `${doc.title}\n${doc.body}`;
      for (const re of SECRET_PATTERNS) {
        expect(re.test(text), `${doc.slug}:secret:${re.source}`).toBe(false);
      }
      for (const re of PII_PATTERNS) {
        expect(re.test(text), `${doc.slug}:pii:${re.source}`).toBe(false);
      }
      expect(text.includes("@"), `${doc.slug}:at-sign`).toBe(false);
    }
  });

  it("merchant-facing topics ship EN+BN pairs", async () => {
    const docs = await loadCorpusDocs(defaultCorpusDir());
    const merchant = docs.filter((d) => d.audience === "merchant");
    expect(merchant.length).toBeGreaterThan(0);
    const byTopic = new Map<string, Set<string>>();
    for (const doc of merchant) {
      const topic = doc.slug.replace(/-(en|bn)$/, "");
      if (!byTopic.has(topic)) byTopic.set(topic, new Set());
      byTopic.get(topic)!.add(doc.locale);
    }
    for (const [topic, locales] of byTopic) {
      expect(locales.has("en"), `${topic}:en`).toBe(true);
      expect(locales.has("bn"), `${topic}:bn`).toBe(true);
    }
  });

  it("parseCorpusFile rejects missing frontmatter and bad locale", () => {
    expect(() => parseCorpusFile("x", "no frontmatter here")).toThrow(
      KbCorpusError,
    );
    expect(() =>
      parseCorpusFile(
        "x",
        '---\ntitle: "T"\nlocale: fr\naudience: merchant\n---\n\n' +
          "b".repeat(300),
      ),
    ).toThrow(KbCorpusError);
  });
});

describe("R2 — seedPublicKb idempotency + dryRun", () => {
  const merchantId = "00000000-0000-0000-0000-00000000seed";
  const db = {} as never;

  async function makeDir(files: Record<string, string>): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "kb-seed-"));
    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(dir, name), content, "utf8");
    }
    return dir;
  }

  function md(title: string, locale = "en", status = "published"): string {
    return (
      `---\ntitle: "${title}"\nlocale: ${locale}\naudience: merchant\n` +
      `tags: [test]\nsource: /test\nversion: ${KB_CORPUS_VERSION}\nstatus: ${status}\n---\n\n` +
      `**Q: What is ${title}?**\n\nBody text. ` +
      "Supporting sentence for the length gate. ".repeat(12)
    );
  }

  it("dryRun reports would-create counts without calling saveDoc", async () => {
    const dir = await makeDir({
      "alpha-en.md": md("Alpha"),
      "beta-en.md": md("Beta"),
    });
    const saveDocFn = vi.fn(async () => ({ id: "x" }));
    const summary = await seedPublicKb(db, merchantId, {
      dir,
      dryRun: true,
      saveDocFn,
      listExistingFn: async () => [],
    });
    expect(summary.dryRun).toBe(true);
    expect(summary.total).toBe(2);
    expect(summary.wouldCreate).toBe(2);
    expect(summary.wouldUpdate).toBe(0);
    expect(summary.created).toBe(0);
    expect(saveDocFn).not.toHaveBeenCalled();
  });

  it("live run creates docs with source+version tags, re-run changes nothing", async () => {
    const dir = await makeDir({
      "alpha-en.md": md("Alpha"),
      "beta-en.md": md("Beta"),
    });
    const store = new Map<
      string,
      { id: string; body: string; tags: string[] }
    >();
    const impl: SaveDocFn = async (_db, _m, _u, input: SaveDocInput) => {
      const id = input.id ?? `id-${input.title}`;
      store.set(input.title, { id, body: input.body, tags: input.tags });
      return { id };
    };
    const saveDocFn = vi.fn(impl);
    const listExistingFn = async (): Promise<ExistingDoc[]> =>
      [...store.entries()].map(([title, v]) => ({
        id: v.id,
        title,
        body: v.body,
        tags: v.tags,
      }));

    const first = await seedPublicKb(db, merchantId, {
      dir,
      saveDocFn,
      listExistingFn,
    });
    expect(first.created).toBe(2);
    expect(first.updated).toBe(0);
    expect(saveDocFn).toHaveBeenCalledTimes(2);

    const seen = saveDocFn.mock.calls.map((c) => c[3]);
    for (const input of seen) {
      expect(input.tags).toContain(KB_CORPUS_SOURCE_TAG);
      expect(input.tags).toContain(KB_CORPUS_VERSION_TAG);
      expect(input.status).toBe("published");
      expect(input.locale).toBe("en");
    }
    // Default seed user id is passed through.
    expect(saveDocFn.mock.calls[0][2]).toBe("system:public-corpus-seed");

    saveDocFn.mockClear();
    const second = await seedPublicKb(db, merchantId, {
      dir,
      saveDocFn,
      listExistingFn,
    });
    expect(second.created).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.upToDate).toBe(2);
    expect(saveDocFn).not.toHaveBeenCalled();
  });

  it("changed bodies update by id; untagged identical bodies get one tag-attach update", async () => {
    const dir = await makeDir({ "alpha-en.md": md("Alpha") });
    const docs = await loadCorpusDocs(dir);
    const corpusBody = docs[0].body;

    const store = new Map<
      string,
      { id: string; body: string; tags: string[] }
    >();
    store.set("Alpha", {
      id: "id-Alpha",
      body: "stale body",
      tags: [KB_CORPUS_SOURCE_TAG],
    });
    const impl: SaveDocFn = async (_d, _m, _u, input: SaveDocInput) => {
      store.set(input.title, {
        id: input.id ?? "new",
        body: input.body,
        tags: [KB_CORPUS_SOURCE_TAG, KB_CORPUS_VERSION_TAG],
      });
      return { id: input.id ?? "new" };
    };
    const saveDocFn = vi.fn(impl);
    const listExistingFn = async (): Promise<ExistingDoc[]> =>
      [...store.entries()].map(([title, v]) => ({
        id: v.id,
        title,
        body: v.body,
        tags: v.tags,
      }));

    const stale = await seedPublicKb(db, merchantId, {
      dir,
      saveDocFn,
      listExistingFn,
    });
    expect(stale.updated).toBe(1);
    expect(saveDocFn.mock.calls[0][3].id).toBe("id-Alpha");
    expect(store.get("Alpha")!.body).toBe(corpusBody);

    // Same body but missing the version tag -> exactly one attach update.
    store.set("Alpha", {
      id: "id-Alpha",
      body: corpusBody,
      tags: [KB_CORPUS_SOURCE_TAG],
    });
    saveDocFn.mockClear();
    const attach = await seedPublicKb(db, merchantId, {
      dir,
      saveDocFn,
      listExistingFn,
    });
    expect(attach.updated).toBe(1);
    expect(attach.created).toBe(0);

    saveDocFn.mockClear();
    const clean = await seedPublicKb(db, merchantId, {
      dir,
      saveDocFn,
      listExistingFn,
    });
    expect(clean.updated).toBe(0);
    expect(saveDocFn).not.toHaveBeenCalled();
  });

  it("draft files are skipped in dryRun and live runs", async () => {
    const dir = await makeDir({
      "live-en.md": md("Live"),
      "wip-en.md": md("Wip", "en", "draft"),
    });
    const saveDocFn = vi.fn(async () => ({ id: "x" }));
    const dry = await seedPublicKb(db, merchantId, {
      dir,
      dryRun: true,
      saveDocFn,
      listExistingFn: async () => [],
    });
    expect(dry.total).toBe(1);
    expect(dry.wouldCreate).toBe(1);
    expect(dry.draftsSkipped).toEqual(["wip-en"]);

    const live = await seedPublicKb(db, merchantId, {
      dir,
      saveDocFn,
      listExistingFn: async () => [],
    });
    expect(live.created).toBe(1);
    expect(live.draftsSkipped).toEqual(["wip-en"]);
    expect(saveDocFn).toHaveBeenCalledTimes(1);
  });

  it("planSeed is pure: create / update / skip / draft buckets", () => {
    const live = stubFile("live");
    const same = stubFile("same");
    const changed = stubFile("changed");
    const draft = stubFile("draft", { status: "draft" });
    const plan = planSeed(
      [live, same, changed, draft],
      [
        {
          id: "1",
          title: same.title,
          body: same.body,
          tags: [KB_CORPUS_VERSION_TAG],
        },
        {
          id: "2",
          title: changed.title,
          body: "old",
          tags: [KB_CORPUS_VERSION_TAG],
        },
      ],
    );
    expect(plan.create.map((d) => d.slug)).toEqual(["live"]);
    expect(plan.update.map((u) => u.doc.slug)).toEqual(["changed"]);
    expect(plan.skip.map((d) => d.slug)).toEqual(["same"]);
    expect(plan.drafts.map((d) => d.slug)).toEqual(["draft"]);
  });
});
