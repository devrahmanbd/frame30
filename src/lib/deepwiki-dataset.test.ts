import { describe, expect, it } from "vitest";
import {
  DEEPWIKI_CATEGORIES,
  DEEPWIKI_DATASET,
  type DeepWikiCategory,
} from "./deepwiki-dataset";
import {
  getSemanticContextPassages,
  getVectorEngineStats,
  initializeVectorIndex,
  searchDeepWikiSemantic,
} from "./semantic-vector.server";
import { exportDeepWikiSftDataset } from "./ai-training-data.server";

describe("DeepWiki Knowledge Base & Unified Semantic Vector Engine", () => {
  it("contains at least 100 verified, fully-formed Q&A specifications", () => {
    expect(DEEPWIKI_DATASET.length).toBeGreaterThanOrEqual(100);

    for (const item of DEEPWIKI_DATASET) {
      expect(item.id).toBeTruthy();
      expect(item.question.length).toBeGreaterThan(15);
      expect(item.summary.length).toBeGreaterThan(20);
      expect(item.answer.length).toBeGreaterThan(80);
      expect(item.tags.length).toBeGreaterThanOrEqual(3);
      expect(item.citations.length).toBeGreaterThanOrEqual(1);
      expect(item.verified).toBe(true);

      // Verify no untranslated placeholders or leaked raw secrets
      expect(item.answer).not.toContain("TODO");
      expect(item.answer).not.toContain("REDACTED");
      expect(item.answer).not.toContain("undefined");
    }
  });

  it("covers all 10 core commerce and platform domains", () => {
    const expectedCategories: DeepWikiCategory[] = [
      "architecture",
      "builder",
      "payments",
      "couriers",
      "catalog",
      "orders",
      "seo",
      "security",
      "domains",
      "operations",
    ];

    expect(DEEPWIKI_CATEGORIES).toHaveLength(10);

    for (const cat of expectedCategories) {
      const itemsInCat = DEEPWIKI_DATASET.filter((d) => d.category === cat);
      expect(
        itemsInCat.length,
        `Expected category ${cat} to have items`,
      ).toBeGreaterThanOrEqual(5);
    }
  });

  it("indexes into 1024-dimensional semantic vectors and returns engine stats", () => {
    initializeVectorIndex();
    const stats = getVectorEngineStats();

    expect(stats.status).toBe("ready");
    expect(stats.dimensions).toBe(1024);
    expect(stats.indexedCount).toBe(DEEPWIKI_DATASET.length);
    expect(stats.categories.length).toBe(10);
  });

  it("finds bKash payment configuration with high semantic similarity as top hit", async () => {
    const hits = await searchDeepWikiSemantic(
      "How do I setup bKash Tokenized Checkout?",
      {
        limit: 3,
      },
    );

    expect(hits.length).toBeGreaterThan(0);
    const top = hits[0];
    expect(top.item.category).toBe("payments");
    expect(top.item.question.toLowerCase()).toContain("bkash");
    expect(top.similarity).toBeGreaterThan(0.5);
    expect(top.score).toBeGreaterThan(0.5);
  });

  it("finds SteadFast courier logistics and webhooks as top hit", async () => {
    const hits = await searchDeepWikiSemantic(
      "How to connect SteadFast courier webhook?",
      {
        limit: 3,
      },
    );

    expect(hits.length).toBeGreaterThan(0);
    const top = hits[0];
    expect(top.item.category).toBe("couriers");
    expect(top.item.question.toLowerCase()).toContain("steadfast");
    expect(top.similarity).toBeGreaterThan(0.5);
  });

  it("finds Page Builder AST JSON specifications when queried about page layout tree", async () => {
    const hits = await searchDeepWikiSemantic(
      "Page builder JSON AST sections layout",
      {
        limit: 3,
      },
    );

    expect(hits.length).toBeGreaterThan(0);
    const top = hits[0];
    expect(top.item.category).toBe("builder");
    expect(top.item.answer).toContain("sections");
  });

  it("finds continuous WAL streaming and disaster recovery specifications", async () => {
    const hits = await searchDeepWikiSemantic(
      "PostgreSQL continuous WAL archiving RPO",
      {
        limit: 3,
      },
    );

    expect(hits.length).toBeGreaterThan(0);
    const top = hits[0];
    expect(top.item.category).toBe("operations");
    expect(top.item.answer.toLowerCase()).toContain("wal");
  });

  it("filters search results strictly by category when requested", async () => {
    const hits = await searchDeepWikiSemantic("refunds and payment ledger", {
      category: "payments",
      limit: 5,
    });

    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit.item.category).toBe("payments");
    }
  });

  it("formats semantic context passages for AI model grounding", async () => {
    const passages = await getSemanticContextPassages(
      "How to configure custom domain with SSL?",
      2,
    );

    expect(passages).toHaveLength(2);
    expect(passages[0].source).toContain("DeepWiki");
    expect(passages[0].body).toContain("custom");
    expect(passages[0].similarity).toBeGreaterThan(0.35);
  });

  it("exports all 100+ items as synthetic ChatML training records for SFT", async () => {
    const sftTurns = await exportDeepWikiSftDataset();

    expect(sftTurns.length).toBe(DEEPWIKI_DATASET.length);
    const first = sftTurns[0];
    expect(first.messages).toHaveLength(3);
    expect(first.messages[0].role).toBe("system");
    expect(first.messages[1].role).toBe("user");
    expect(first.messages[2].role).toBe("assistant");
    expect(first.messages[2].content.length).toBeGreaterThan(100);
  });
});
