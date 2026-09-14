import { describe, expect, it } from "vitest";
import {
  bulkActionsFor,
  bulkEditPatch,
  dateBuckets,
  dateCellLabel,
  effectiveStatus,
  EMPTY_BULK_EDIT,
  filterRows,
  formatWpDate,
  matchesView,
  NO_CHANGE,
  parentOptions,
  parseCounts,
  quickEditFrom,
  rowActions,
  seoBand,
  slugifyTitle,
  sortRows,
  statusTabs,
  titleSuffixes,
  trashDaysLeft,
  validateQuickEdit,
  type ContentRow,
} from "./content-desk";

function row(overrides: Partial<ContentRow> = {}): ContentRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    kind: "page",
    title: "About us",
    slug: "about",
    status: "draft",
    visibility: "public",
    hasPassword: false,
    editor: "classic",
    template: "default",
    parentId: null,
    menuOrder: 0,
    allowComments: false,
    authorId: null,
    authorName: "Nahid",
    categories: [],
    tags: [],
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-04T08:53:00.000Z",
    publishedAt: null,
    scheduledFor: null,
    trashedAt: null,
    isHome: false,
    seo: { score: 70, focusKeyword: "", failing: [] },
    ...overrides,
  };
}

describe("status tabs", () => {
  it("All excludes trash and lists only non-empty statuses, trash last", () => {
    const tabs = statusTabs({ published: 9, draft: 2, trash: 1, scheduled: 0 });
    expect(tabs.map((t) => `${t.view}:${t.count}`)).toEqual(["all:11", "published:9", "draft:2", "trash:1"]);
  });
  it("matchesView follows WordPress semantics", () => {
    expect(matchesView({ status: "draft" }, "all")).toBe(true);
    expect(matchesView({ status: "trash" }, "all")).toBe(false);
    expect(matchesView({ status: "trash" }, "trash")).toBe(true);
  });
  it("parseCounts tolerates unknown keys and strings", () => {
    expect(parseCounts({ published: "3", archived: 2, draft: 1 })).toEqual({ published: 3, draft: 1 });
    expect(parseCounts(null)).toEqual({});
  });
});

describe("title suffixes", () => {
  it("prints — Draft, — Builder, — Home page in that order", () => {
    expect(titleSuffixes(row({ editor: "builder", isHome: true }))).toEqual(["Draft", "Builder", "Home page"]);
  });
  it("published public pages get no suffix", () => {
    expect(titleSuffixes(row({ status: "published" }))).toEqual([]);
  });
  it("password protected shows regardless of status", () => {
    expect(titleSuffixes(row({ status: "published", hasPassword: true }))).toEqual(["Password protected"]);
  });
});

describe("row actions", () => {
  it("draft rows say Preview, published rows say View", () => {
    expect(rowActions({ status: "draft", editor: "classic" })).toEqual(["edit", "quick-edit", "trash", "preview", "edit-builder"]);
    expect(rowActions({ status: "published", editor: "classic" })[3]).toBe("view");
  });
  it("trash rows only restore or delete", () => {
    expect(rowActions({ status: "trash", editor: "classic" })).toEqual(["restore", "delete"]);
  });
  it("bulk menu differs on the Trash tab", () => {
    expect(bulkActionsFor("all")).toEqual(["edit", "trash", "publish", "unpublish"]);
    expect(bulkActionsFor("trash")).toEqual(["restore", "delete"]);
  });
});

describe("dates", () => {
  it("formats the WordPress way", () => {
    const d = new Date(2026, 8, 4, 8, 53);
    expect(formatWpDate(d.toISOString())).toBe("2026/09/04 at 8:53 am");
    expect(formatWpDate(new Date(2026, 0, 1, 0, 5).toISOString())).toBe("2026/01/01 at 12:05 am");
    expect(formatWpDate(null)).toBe("—");
  });
  it("labels the date cell by status", () => {
    expect(dateCellLabel(row()).label.en).toBe("Last Modified");
    expect(dateCellLabel(row({ status: "published", publishedAt: "2026-09-02T00:00:00Z" }))).toMatchObject({ iso: "2026-09-02T00:00:00Z" });
    expect(dateCellLabel(row({ status: "trash", trashedAt: "x" })).label.en).toBe("Trashed");
  });
  it("counts down the trash retention and never goes negative", () => {
    const now = new Date("2026-09-04T00:00:00Z");
    expect(trashDaysLeft("2026-09-01T00:00:00Z", now)).toBe(27);
    expect(trashDaysLeft("2026-07-01T00:00:00Z", now)).toBe(0);
    expect(trashDaysLeft(null, now)).toBe(30);
  });
  it("buckets by month, newest first", () => {
    const buckets = dateBuckets([row({ createdAt: "2026-07-10T00:00:00Z" }), row({ createdAt: "2026-09-01T00:00:00Z" }), row({ createdAt: "2026-09-20T00:00:00Z" })]);
    expect(buckets.map((b) => b.id)).toEqual(["2026-09", "2026-07"]);
    expect(buckets[0].label).toBe("September 2026");
  });
});

describe("filter and sort", () => {
  const rows = [
    row({ id: "a", title: "Zeta", slug: "zeta", status: "published", publishedAt: "2026-09-03T00:00:00Z", seo: { score: 90, focusKeyword: "", failing: [] } }),
    row({ id: "b", title: "Alpha", slug: "alpha", status: "draft", updatedAt: "2026-09-04T00:00:00Z", seo: { score: 40, focusKeyword: "", failing: [] } }),
    row({ id: "c", title: "Gone", slug: "gone", status: "trash", trashedAt: "2026-09-02T00:00:00Z" }),
    row({ id: "d", title: "Tagged", slug: "tagged", kind: "post", tags: ["eid"], categories: ["News"] }),
  ];
  it("searches title, slug, author and tags", () => {
    expect(filterRows(rows, { view: "all", q: "alp" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterRows(rows, { view: "all", q: "eid" }).map((r) => r.id)).toEqual(["d"]);
    expect(filterRows(rows, { view: "all", q: "nahid" })).toHaveLength(3);
  });
  it("filters by category and date bucket", () => {
    expect(filterRows(rows, { view: "all", q: "", category: "News" }).map((r) => r.id)).toEqual(["d"]);
    expect(filterRows(rows, { view: "all", q: "", bucket: "2026-08" })).toHaveLength(0);
  });
  it("sorts by title, seo and date", () => {
    expect(sortRows(rows, "title", "asc").map((r) => r.title)).toEqual(["Alpha", "Gone", "Tagged", "Zeta"]);
    expect(sortRows(rows, "seo", "desc")[0].id).toBe("a");
    expect(sortRows(rows.slice(0, 2), "date", "desc")[0].id).toBe("b");
  });
});

describe("quick edit", () => {
  it("prefills from the row and maps trash/private status to draft", () => {
    const d = quickEditFrom(row({ status: "private", visibility: "private", menuOrder: 3 }));
    expect(d.status).toBe("draft");
    expect(d.isPrivate).toBe(true);
    expect(d.menuOrder).toBe(3);
  });
  it("validates slug, title, order, parent and password/private clash", () => {
    const d = quickEditFrom(row());
    expect(validateQuickEdit(d)).toEqual({});
    expect(validateQuickEdit({ ...d, slug: "Bad Slug" }).slug).toBeTruthy();
    expect(validateQuickEdit({ ...d, title: "a" }).title).toBeTruthy();
    expect(validateQuickEdit({ ...d, menuOrder: -1 }).menuOrder).toBeTruthy();
    expect(validateQuickEdit({ ...d, parentId: "self" }, { selfId: "self" }).parentId).toBeTruthy();
    expect(validateQuickEdit({ ...d, password: "x", isPrivate: true }).password).toBeTruthy();
  });
  it("resolves the effective status/visibility", () => {
    const d = quickEditFrom(row());
    const now = new Date("2026-09-04T00:00:00Z");
    expect(effectiveStatus({ ...d, isPrivate: true }, now)).toEqual({ status: "private", visibility: "private" });
    expect(effectiveStatus({ ...d, status: "published", date: "2030-01-01T00:00" }, now).status).toBe("scheduled");
    expect(effectiveStatus({ ...d, status: "published", password: "pw" }, now)).toEqual({ status: "published", visibility: "password" });
  });
  it("slugifies titles", () => {
    expect(slugifyTitle("  Delivery & Returns!  ")).toBe("delivery-returns");
    expect(slugifyTitle("Café Ünïcode")).toBe("cafe-unicode");
  });
});

describe("bulk edit", () => {
  it("sends only changed fields", () => {
    expect(bulkEditPatch(EMPTY_BULK_EDIT)).toEqual({});
    expect(bulkEditPatch({ ...EMPTY_BULK_EDIT, status: "published", parentId: null })).toEqual({ status: "published", parentId: null });
    expect(NO_CHANGE).toBe("__no_change__");
  });
});

describe("parent options", () => {
  it("nests children under parents, skips trash and self", () => {
    const rows = [
      row({ id: "p", title: "Parent", menuOrder: 1 }),
      row({ id: "c", title: "Child", parentId: "p" }),
      row({ id: "t", title: "Trashed", status: "trash" }),
      row({ id: "me", title: "Me" }),
    ];
    const opts = parentOptions(rows, "me");
    expect(opts.map((o) => `${o.depth}:${o.label}`)).toEqual(["0:Parent", "1:Child"]);
  });
});

describe("seo band", () => {
  it("uses Rank Math ranges", () => {
    expect(seoBand(81)).toBe("great");
    expect(seoBand(80)).toBe("good");
    expect(seoBand(50)).toBe("poor");
  });
});
