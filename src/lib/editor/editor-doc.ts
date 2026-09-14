/**
 * Phase 12 — the editor document model.
 *
 * One `EditorDoc` describes a page or a post inside the takeover shell: the
 * body plus every WordPress "document settings" field the sidebar exposes
 * (status, publish date, slug, author, template, discussion, format, parent,
 * order, visibility, featured image, excerpt, taxonomy). Everything here is
 * pure and unit-tested; the server module maps it to and from table rows.
 */
import type { ContentKind, ContentStatus, EditorKind, Visibility } from "@/lib/content-desk";
import { BODY_LIMITS, bodyStats, parseBody, type Block } from "@/lib/blog-body";
import { isBuilderBody } from "@/lib/page-builder";
import { markdownToBlocks } from "./page-markdown";
import { EMPTY_ENTITY_SEO, parseEntitySeo, type EntitySeo } from "@/lib/seo/seo-meta";

export type { ContentKind, ContentStatus, EditorKind, Visibility };

export const POST_FORMATS = [
  { id: "standard", en: "Standard", bn: "সাধারণ" },
  { id: "aside", en: "Aside", bn: "পার্শ্বনোট" },
  { id: "image", en: "Image", bn: "ছবি" },
  { id: "video", en: "Video", bn: "ভিডিও" },
  { id: "quote", en: "Quote", bn: "উদ্ধৃতি" },
  { id: "link", en: "Link", bn: "লিঙ্ক" },
  { id: "gallery", en: "Gallery", bn: "গ্যালারি" },
] as const;
export type PostFormat = (typeof POST_FORMATS)[number]["id"];

/** Sidebar status radios, in WordPress order. `scheduled` is derived from the date. */
export const STATUS_CHOICES: {
  id: Exclude<ContentStatus, "scheduled" | "trash">;
  en: string;
  bn: string;
  hint: { en: string; bn: string };
}[] = [
  {
    id: "draft",
    en: "Draft",
    bn: "খসড়া",
    hint: { en: "Not ready to publish.", bn: "প্রকাশের জন্য প্রস্তুত নয়।" },
  },
  {
    id: "pending",
    en: "Pending review",
    bn: "পর্যালোচনা বাকি",
    hint: {
      en: "Waiting for a review before publishing.",
      bn: "প্রকাশের আগে পর্যালোচনার অপেক্ষায়।",
    },
  },
  {
    id: "private",
    en: "Private",
    bn: "ব্যক্তিগত",
    hint: {
      en: "Only visible to site admins and editors.",
      bn: "শুধু অ্যাডমিন ও সম্পাদক দেখতে পাবেন।",
    },
  },
  {
    id: "published",
    en: "Published",
    bn: "প্রকাশিত",
    hint: { en: "Visible to everyone.", bn: "সবাই দেখতে পাবেন।" },
  },
];

export type EditorDoc = {
  id: string | null;
  kind: ContentKind;
  title: string;
  /** Posts keep a secondary English title used for slugs and hreflang. */
  titleEn: string;
  slug: string;
  /** Raw stored body: markdown (pages), block markup (posts) or a builder doc for either. */
  body: string;
  editor: EditorKind;
  excerpt: string;
  status: ContentStatus;
  /** ISO timestamp or null for "Immediately". */
  publishAt: string | null;
  publishedAt: string | null;
  visibility: Visibility;
  password: string;
  authorId: string | null;
  template: string;
  /** Phase 17 — installed theme pinned to this page, or null for the site theme. */
  themeId: string | null;
  parentId: string | null;
  menuOrder: number;
  allowComments: boolean;
  format: PostFormat;
  featuredImage: string;
  showInNav: boolean;
  /** Posts: term ids. */
  categories: string[];
  tags: string[];
  seo: { metaTitle: string; metaDescription: string; canonical: string; robots: string };
  /** Phase 13 — the extended Rank Math-style record behind the SEO meta box. */
  seoExtended: EntitySeo;
  updatedAt: string | null;
  createdAt: string | null;
};

export function emptyEditorDoc(kind: ContentKind): EditorDoc {
  return {
    id: null,
    kind,
    title: "",
    titleEn: "",
    slug: "",
    body: "",
    editor: "classic",
    excerpt: "",
    status: "draft",
    publishAt: null,
    publishedAt: null,
    visibility: "public",
    password: "",
    authorId: null,
    template: "default",
    themeId: null,
    parentId: null,
    menuOrder: 0,
    allowComments: kind === "post",
    format: "standard",
    featuredImage: "",
    showInNav: false,
    categories: [],
    tags: [],
    seo: { metaTitle: "", metaDescription: "", canonical: "", robots: "index,follow" },
    seoExtended: EMPTY_ENTITY_SEO,
    updatedAt: null,
    createdAt: null,
  };
}

/* ------------------------------------------------------------------ slugs */

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0980-\u09ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/** The slug shown in the sidebar: explicit, or derived from the title. */
export function effectiveSlug(doc: Pick<EditorDoc, "slug" | "title" | "titleEn">): string {
  return doc.slug || slugify(doc.titleEn || doc.title) || "";
}

/* --------------------------------------------------------------- body view */

/** Parse whatever is stored into editor blocks; builder docs yield none. */
export function bodyBlocks(doc: Pick<EditorDoc, "kind" | "body">): Block[] {
  if (isBuilderBody(doc.body)) return [];
  return doc.kind === "page" ? markdownToBlocks(doc.body) : parseBody(doc.body);
}

export type DocStats = {
  words: number;
  minutes: number;
  characters: number;
  headings: number;
  images: number;
};

export function docStats(doc: Pick<EditorDoc, "kind" | "body">): DocStats {
  const stats = bodyStats(bodyBlocks(doc));
  return {
    words: stats.words,
    minutes:
      stats.words === 0 ? 0 : Math.max(1, Math.round(stats.words / BODY_LIMITS.wordsPerMinute)),
    characters: stats.characters,
    headings: stats.headings,
    images: stats.images,
  };
}

/** Outline entries for the "☰ Outline" panel: headings with their level. */
export function docOutline(
  doc: Pick<EditorDoc, "kind" | "body">,
): { level: number; text: string; index: number }[] {
  const out: { level: number; text: string; index: number }[] = [];
  bodyBlocks(doc).forEach((block, index) => {
    if (block.type === "heading") {
      const text = block.inline
        .map(function walk(node): string {
          if (node.t === "text") return node.v;
          if (node.t === "br") return " ";
          return node.c.map(walk).join("");
        })
        .join("")
        .trim();
      out.push({ level: block.level, text: text || "(empty heading)", index });
    }
  });
  return out;
}

/* ----------------------------------------------------------- publish logic */

/** What actually gets stored when the user presses the primary button. */
export function resolvePublishStatus(
  doc: Pick<EditorDoc, "status" | "publishAt" | "visibility">,
  now = Date.now(),
): ContentStatus {
  if (doc.status === "trash") return "trash";
  if (doc.visibility === "private" || doc.status === "private") return "private";
  if (
    doc.status === "published" &&
    doc.publishAt &&
    new Date(doc.publishAt).getTime() > now + 60_000
  ) {
    return "scheduled";
  }
  if (doc.status === "scheduled") {
    return doc.publishAt && new Date(doc.publishAt).getTime() > now ? "scheduled" : "published";
  }
  return doc.status;
}

export type PrimaryAction = "publish" | "update" | "schedule" | "submit";

/** Publish · Update · Schedule · Submit for review — the WordPress primary button. */
export function primaryAction(
  doc: Pick<EditorDoc, "status" | "publishAt" | "publishedAt" | "visibility">,
  canPublish: boolean,
  now = Date.now(),
): PrimaryAction {
  if (!canPublish) return "submit";
  const target = resolvePublishStatus(doc, now);
  if (target === "scheduled") return "schedule";
  if (target === "published" || target === "private") return doc.publishedAt ? "update" : "publish";
  return doc.publishedAt ? "update" : "publish";
}

export const PRIMARY_LABEL: Record<PrimaryAction, { en: string; bn: string }> = {
  publish: { en: "Publish", bn: "প্রকাশ" },
  update: { en: "Update", bn: "আপডেট" },
  schedule: { en: "Schedule", bn: "নির্ধারণ" },
  submit: { en: "Submit for review", bn: "পর্যালোচনায় পাঠান" },
};

export type PrePublishCheck = {
  id: string;
  ok: boolean;
  level: "pass" | "warn" | "fail";
  en: string;
  bn: string;
};

/**
 * The pre-publish panel: visibility, date, SEO score, outstanding lints.
 * A `fail` blocks the primary button; `warn` is informational.
 */
export function prePublishChecks(
  doc: EditorDoc,
  extras: { seoScore: number | null; builderLints: number; slugTaken: boolean },
  now = Date.now(),
): PrePublishCheck[] {
  const checks: PrePublishCheck[] = [];
  const stats = docStats(doc);
  const status = resolvePublishStatus(doc, now);

  checks.push({
    id: "title",
    ok: doc.title.trim().length > 0,
    level: doc.title.trim() ? "pass" : "fail",
    en: doc.title.trim() ? "Title is set" : "Add a title before publishing",
    bn: doc.title.trim() ? "শিরোনাম আছে" : "প্রকাশের আগে শিরোনাম দিন",
  });
  checks.push({
    id: "slug",
    ok: !extras.slugTaken && effectiveSlug(doc).length > 0,
    level: extras.slugTaken ? "fail" : effectiveSlug(doc) ? "pass" : "fail",
    en: extras.slugTaken
      ? "That URL is already used by another item"
      : `URL: /${effectiveSlug(doc) || "…"}`,
    bn: extras.slugTaken
      ? "এই ঠিকানা অন্য কিছুতে ব্যবহৃত"
      : `ঠিকানা: /${effectiveSlug(doc) || "…"}`,
  });
  checks.push({
    id: "visibility",
    ok: true,
    level: "pass",
    en:
      doc.visibility === "password"
        ? "Visibility: password protected"
        : doc.visibility === "private"
          ? "Visibility: private"
          : "Visibility: public",
    bn:
      doc.visibility === "password"
        ? "দৃশ্যমানতা: পাসওয়ার্ড সুরক্ষিত"
        : doc.visibility === "private"
          ? "দৃশ্যমানতা: ব্যক্তিগত"
          : "দৃশ্যমানতা: সর্বজনীন",
  });
  if (doc.visibility === "password" && !doc.password) {
    checks.push({
      id: "password",
      ok: false,
      level: "fail",
      en: "Password protection needs a password",
      bn: "পাসওয়ার্ড সুরক্ষার জন্য পাসওয়ার্ড দিন",
    });
  }
  checks.push({
    id: "date",
    ok: true,
    level: "pass",
    en:
      status === "scheduled"
        ? `Scheduled for ${formatPublishDate(doc.publishAt)}`
        : "Publish: immediately",
    bn: status === "scheduled" ? `নির্ধারিত: ${formatPublishDate(doc.publishAt)}` : "প্রকাশ: এখনই",
  });
  checks.push({
    id: "body",
    ok: stats.words > 0 || isBuilderBody(doc.body),
    level: stats.words > 0 || isBuilderBody(doc.body) ? "pass" : "warn",
    en: isBuilderBody(doc.body)
      ? "Builder layout"
      : stats.words > 0
        ? `${stats.words} words · ${stats.minutes} min read`
        : "Body is empty",
    bn: isBuilderBody(doc.body)
      ? "বিল্ডার লেআউট"
      : stats.words > 0
        ? `${stats.words} শব্দ · ${stats.minutes} মিনিট`
        : "লেখা খালি",
  });
  if (extras.seoScore !== null) {
    const band = extras.seoScore >= 81 ? "pass" : extras.seoScore >= 51 ? "warn" : "warn";
    checks.push({
      id: "seo",
      ok: extras.seoScore >= 51,
      level: band,
      en: `SEO score ${extras.seoScore} / 100`,
      bn: `এসইও স্কোর ${extras.seoScore} / ১০০`,
    });
  }
  if (isBuilderBody(doc.body)) {
    checks.push({
      id: "lints",
      ok: extras.builderLints === 0,
      level: extras.builderLints === 0 ? "pass" : "warn",
      en:
        extras.builderLints === 0
          ? "No builder warnings"
          : `${extras.builderLints} builder warning(s) unresolved`,
      bn:
        extras.builderLints === 0
          ? "বিল্ডার সতর্কতা নেই"
          : `${extras.builderLints}টি বিল্ডার সতর্কতা বাকি`,
    });
  }
  if (doc.kind === "post" && doc.categories.length === 0) {
    checks.push({
      id: "category",
      ok: false,
      level: "warn",
      en: "No category assigned",
      bn: "কোনো বিভাগ নেই",
    });
  }
  return checks;
}

export function canProceed(checks: PrePublishCheck[]): boolean {
  return checks.every((check) => check.level !== "fail");
}

/* ------------------------------------------------------------------ dates */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Immediately" or `Sep 4, 2026 8:53 am`. */
export function formatPublishDate(iso: string | null): string {
  if (!iso) return "Immediately";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Immediately";
  const h = d.getHours();
  const hh = h % 12 === 0 ? 12 : h % 12;
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${hh}:${mm} ${h < 12 ? "am" : "pm"}`;
}

/** "Last edited 13 hours ago" — coarse buckets, like WordPress. */
export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const diff = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.round(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

/** `datetime-local` value for a date input, in local time. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/* ------------------------------------------------------------ dirty check */

/** Fields that count as "content" for autosave and the unsaved-changes prompt. */
export function docSignature(doc: EditorDoc): string {
  const { updatedAt: _u, createdAt: _c, publishedAt: _p, ...rest } = doc;
  return JSON.stringify(rest);
}

export function isDirty(a: EditorDoc, b: EditorDoc): boolean {
  return docSignature(a) !== docSignature(b);
}

/* ------------------------------------------------------------- validation */

export type DocIssue = { field: keyof EditorDoc | "body"; en: string; bn: string };

export function validateDoc(doc: EditorDoc): DocIssue[] {
  const issues: DocIssue[] = [];
  if (doc.title.trim().length === 0)
    issues.push({ field: "title", en: "Title is required.", bn: "শিরোনাম আবশ্যক।" });
  if (doc.title.length > 200)
    issues.push({
      field: "title",
      en: "Title is longer than 200 characters.",
      bn: "শিরোনাম ২০০ অক্ষরের বেশি।",
    });
  if (doc.slug && !/^[a-z0-9\u0980-\u09ff-]{1,120}$/.test(doc.slug)) {
    issues.push({
      field: "slug",
      en: "Slug may only use lowercase letters, numbers and dashes.",
      bn: "স্লাগে শুধু ছোট হাতের অক্ষর, সংখ্যা ও ড্যাশ চলবে।",
    });
  }
  if (doc.excerpt.length > 1000)
    issues.push({
      field: "excerpt",
      en: "Excerpt is longer than 1000 characters.",
      bn: "সারসংক্ষেপ ১০০০ অক্ষরের বেশি।",
    });
  if (doc.body.length > BODY_LIMITS.maxChars)
    issues.push({ field: "body", en: "Body is too long.", bn: "লেখা খুব বড়।" });
  if (doc.visibility === "password" && doc.password.length === 0) {
    issues.push({
      field: "password",
      en: "Enter a password or switch visibility back to public.",
      bn: "পাসওয়ার্ড দিন বা দৃশ্যমানতা সর্বজনীন করুন।",
    });
  }
  if (doc.password.length > 64)
    issues.push({
      field: "password",
      en: "Password is longer than 64 characters.",
      bn: "পাসওয়ার্ড ৬৪ অক্ষরের বেশি।",
    });
  if (!Number.isInteger(doc.menuOrder) || doc.menuOrder < -9999 || doc.menuOrder > 9999) {
    issues.push({
      field: "menuOrder",
      en: "Order must be a whole number between -9999 and 9999.",
      bn: "ক্রম -৯৯৯৯ থেকে ৯৯৯৯ এর মধ্যে পূর্ণসংখ্যা হবে।",
    });
  }
  if (doc.seo.metaTitle.length > 200)
    issues.push({ field: "seo", en: "SEO title is too long.", bn: "এসইও শিরোনাম খুব বড়।" });
  if (doc.seo.metaDescription.length > 600)
    issues.push({ field: "seo", en: "SEO description is too long.", bn: "এসইও বিবরণ খুব বড়।" });
  return issues;
}

/* --------------------------------------------------------------- shortcuts */

export const EDITOR_SHORTCUTS: { keys: string; en: string; bn: string }[] = [
  { keys: "⌘S", en: "Save draft / update", bn: "খসড়া সংরক্ষণ / আপডেট" },
  { keys: "⌘⇧P", en: "Publish", bn: "প্রকাশ" },
  { keys: "⌘\\", en: "Toggle settings sidebar", bn: "সেটিংস সাইডবার" },
  { keys: "⌘Z / ⇧⌘Z", en: "Undo / redo", bn: "পূর্বাবস্থা / পুনরায়" },
  { keys: "⌘K", en: "Command palette", bn: "কমান্ড প্যালেট" },
  { keys: "⌘B / ⌘I / ⌘U", en: "Bold / italic / underline", bn: "বোল্ড / ইটালিক / আন্ডারলাইন" },
  { keys: "⌘⇧K", en: "Insert link", bn: "লিঙ্ক যোগ" },
  { keys: "⌘⇧O", en: "Toggle outline", bn: "আউটলাইন" },
  { keys: "Esc", en: "Close panel / back to list", bn: "প্যানেল বন্ধ / তালিকায় ফিরুন" },
  { keys: "?", en: "This help", bn: "এই সাহায্য" },
];

/** Title pill: `Untitled · Page`. */
export function titlePill(
  doc: Pick<EditorDoc, "title" | "kind">,
  lang: "en" | "bn",
): { title: string; kind: string } {
  const title = doc.title.trim() || (lang === "bn" ? "শিরোনামহীন" : "Untitled");
  const kind =
    doc.kind === "page" ? (lang === "bn" ? "পেজ" : "Page") : lang === "bn" ? "পোস্ট" : "Post";
  return { title, kind };
}

/* ------------------------------------------------------------ parent tree */

export type ParentOption = { id: string; title: string; depth: number };

/** Flatten pages into an indented parent picker, excluding the doc itself and its descendants. */
export function parentOptions(
  pages: { id: string; title: string; parentId: string | null }[],
  selfId: string | null,
): ParentOption[] {
  const byParent = new Map<
    string | null,
    { id: string; title: string; parentId: string | null }[]
  >();
  for (const page of pages) {
    const list = byParent.get(page.parentId) ?? [];
    list.push(page);
    byParent.set(page.parentId, list);
  }
  const out: ParentOption[] = [];
  const walk = (parent: string | null, depth: number, seen: Set<string>) => {
    for (const page of byParent.get(parent) ?? []) {
      if (page.id === selfId || seen.has(page.id)) continue;
      seen.add(page.id);
      out.push({ id: page.id, title: page.title || "(no title)", depth });
      if (depth < 6) walk(page.id, depth + 1, seen);
    }
  };
  walk(null, 0, new Set());
  return out;
}
