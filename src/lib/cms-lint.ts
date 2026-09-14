/**
 * Phase 2.8 — SEO lint, client-safe so the editor can run it as you type.
 */
/** Human SEO lint for the editor: never blocks a save, always explains itself. */
export function lintArticle(input: { title: string; body: string; metaTitle: string; metaDescription: string; excerpt: string }) {
  const notes: { code: string; en: string; bn: string }[] = [];
  const metaTitle = input.metaTitle || input.title;
  if (metaTitle.length > 60) notes.push({ code: "meta_title_long", en: "Meta title is over 60 characters.", bn: "মেটা শিরোনাম ৬০ অক্ষরের বেশি।" });
  if (!input.metaDescription.trim()) notes.push({ code: "meta_description_missing", en: "Add a meta description.", bn: "একটি মেটা বিবরণ যোগ করুন।" });
  else if (input.metaDescription.length > 160) notes.push({ code: "meta_description_long", en: "Meta description is over 160 characters.", bn: "মেটা বিবরণ ১৬০ অক্ষরের বেশি।" });
  if (!input.excerpt.trim()) notes.push({ code: "excerpt_missing", en: "An excerpt improves list and share cards.", bn: "সারসংক্ষেপ থাকলে তালিকা ও শেয়ার কার্ড ভালো দেখায়।" });
  if (input.body.trim().split(/\s+/).filter(Boolean).length < 120)
    notes.push({ code: "body_thin", en: "Body is under 120 words — thin for search.", bn: "লেখাটি ১২০ শব্দের কম — সার্চের জন্য কম।" });
  return notes;
}

