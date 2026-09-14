import { useState } from "react";
import { Button } from "@/components/ui/button";
import { shareLinks } from "@/lib/blog-reader";
import { useLang } from "@/lib/i18n";

export function ShareControls({ slug, title }: { slug: string; title: string }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const links = shareLinks(typeof window === "undefined" ? "" : window.location.origin, slug, title);
  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setCopied(false); }
  };
  return <section aria-label={t("Share article", "লেখাটি শেয়ার করুন")} className="flex flex-wrap items-center gap-2"><span className="mr-1 text-sm text-muted-foreground">{t("Share", "শেয়ার")}</span><Button type="button" variant="outline" size="sm" onClick={copy}>{copied ? t("Copied", "কপি হয়েছে") : t("Copy link", "লিংক কপি")}</Button><Button asChild variant="outline" size="sm"><a href={links.linkedin} target="_blank" rel="noopener">LinkedIn</a></Button><Button asChild variant="outline" size="sm"><a href={links.facebook} target="_blank" rel="noopener">Facebook</a></Button><Button asChild variant="outline" size="sm"><a href={links.x} target="_blank" rel="noopener">X</a></Button></section>;
}