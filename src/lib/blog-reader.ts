import { bodyStats, inlineToText, parseBody, type Block } from "./blog-body";
import { articlePath } from "./blog-taxonomy";

export const BLOG_READER_LIMITS = {
  searchChars: 80,
  searchPageSize: 12,
  related: 3,
  feedItems: 40,
  authorPageSize: 12,
  tocItems: 40,
} as const;

export type BlogAuthor = {
  slug: string;
  displayName: string;
  displayNameEn: string | null;
  roleTitle: string | null;
  bio: string | null;
  bioEn: string | null;
  avatarUrl: string | null;
  websiteUrl: string | null;
  socialLinks: Record<string, string>;
};

export type TocItem = { id: string; label: string; level: 2 | 3 | 4 };

export function headingId(label: string, index: number): string {
  const slug = label
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0980-\u09ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return slug || `section-${index + 1}`;
}

export function articleOutline(body: string): { blocks: Block[]; toc: TocItem[]; readingMinutes: number } {
  const blocks = parseBody(body);
  const used = new Map<string, number>();
  const toc: TocItem[] = [];
  for (const block of blocks) {
    if (block.type !== "heading" || toc.length >= BLOG_READER_LIMITS.tocItems) continue;
    const label = inlineToText(block.inline).trim();
    if (!label) continue;
    const base = headingId(label, toc.length);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    toc.push({ id: seen ? `${base}-${seen + 1}` : base, label, level: block.level });
  }
  return { blocks, toc, readingMinutes: bodyStats(blocks).readingMinutes };
}

/** Returns the exact anchor sequence used by both the TOC and body renderer. */
export function articleHeadingIds(blocks: Block[]): Map<number, string> {
  const used = new Map<string, number>();
  const ids = new Map<number, string>();
  let headingIndex = 0;
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex];
    if (block?.type !== "heading") continue;
    const base = headingId(inlineToText(block.inline).trim(), headingIndex);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    ids.set(blockIndex, seen ? `${base}-${seen + 1}` : base);
    headingIndex += 1;
  }
  return ids;
}

export function normalizeBlogSearch(raw: unknown): string {
  return String(raw ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[%_\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, BLOG_READER_LIMITS.searchChars);
}

export function shareLinks(origin: string, slug: string, title: string) {
  const url = `${origin.replace(/\/$/, "")}${articlePath(slug)}`;
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  return {
    copy: url,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    x: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
  };
}

export function articleJsonLd(input: {
  origin?: string | null;
  slug: string;
  title: string;
  description: string;
  image?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  author?: BlogAuthor | null;
  publisher: string;
  readingMinutes: number;
}) {
  const origin = input.origin?.replace(/\/$/, "") ?? "";
  const url = `${origin}${articlePath(input.slug)}`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    ...(input.image?.startsWith("https://") ? { image: [input.image] } : {}),
    ...(input.publishedAt ? { datePublished: input.publishedAt } : {}),
    ...(input.updatedAt ? { dateModified: input.updatedAt } : {}),
    timeRequired: `PT${Math.max(1, input.readingMinutes)}M`,
    author: input.author
      ? {
          "@type": "Person",
          name: input.author.displayNameEn || input.author.displayName,
          url: `${origin}/blog/author/${encodeURIComponent(input.author.slug)}`,
        }
      : { "@type": "Organization", name: input.publisher },
    publisher: { "@type": "Organization", name: input.publisher },
  };
}

export function personJsonLd(origin: string, author: BlogAuthor) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: author.displayNameEn || author.displayName,
    alternateName: author.displayNameEn ? author.displayName : undefined,
    description: author.bioEn || author.bio || undefined,
    url: `${origin.replace(/\/$/, "")}/blog/author/${encodeURIComponent(author.slug)}`,
    image: author.avatarUrl || undefined,
    jobTitle: author.roleTitle || undefined,
    sameAs: [author.websiteUrl, ...Object.values(author.socialLinks)].filter(
      (value): value is string => typeof value === "string" && value.startsWith("https://"),
    ),
  };
}

export function escapeFeedXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}