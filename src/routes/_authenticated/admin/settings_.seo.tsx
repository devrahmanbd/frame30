/**
 * Phase 13 — `/admin/settings/seo`: the site-wide SEO desk.
 *
 * Five panels, the way a merchant coming from Rank Math expects to find them:
 * Titles & Meta (per content type templates with `%token%` variables),
 * Sitemap, Search Console verification, Redirections and the 404 monitor.
 * Every write goes through the permission-checked server functions; the pure
 * model re-validates, so nothing unsafe can be stored from a crafted request.
 */
import { useMemo, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Badge,
  Card,
  EmptyState,
  Page,
  btnGhost,
  btnPrimary,
  inputClass,
} from "@/components/console/kit";
import { CheckboxRow, TokenField, UnderlineTabs } from "@/components/admin/seo/metabox/parts";
import { useLang } from "@/lib/i18n";
import { SEPARATORS, applyTokens } from "@/lib/seo/seo-meta";
import {
  REDIRECT_CODE_OPTIONS,
  SEO_ENTITY_KINDS,
  normalisePath,
  validateRedirect,
  type RedirectRow,
  type SeoEntityKind,
  type SiteSeoSettings,
} from "@/lib/seo/site-seo";
import {
  notFoundClearFn,
  notFoundRedirectFn,
  redirectDeleteFn,
  redirectSaveFn,
  siteSeoLoadFn,
  siteSeoSaveFn,
} from "@/lib/seo/site-seo.functions";

export const Route = createFileRoute("/_authenticated/admin/settings_/seo")({
  loader: () => siteSeoLoadFn(),
  head: () => ({
    meta: [
      { title: "SEO settings — Framique admin" },
      {
        name: "description",
        content:
          "Search titles, meta templates, sitemap, verification, redirects and the 404 monitor for your store.",
      },
      { property: "og:title", content: "SEO settings — Framique admin" },
      { property: "og:description", content: "Control how your store appears in search results." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SeoSettingsPage,
});

type TabId = "titles" | "sitemap" | "verification" | "analytics" | "redirects" | "notfound";

const KIND_LABEL: Record<SeoEntityKind, { en: string; bn: string }> = {
  home: { en: "Homepage", bn: "হোমপেজ" },
  product: { en: "Products", bn: "পণ্য" },
  collection: { en: "Collections", bn: "কালেকশন" },
  page: { en: "Pages", bn: "পেজ" },
  post: { en: "Posts", bn: "পোস্ট" },
};

function SeoSettingsPage() {
  const bundle = Route.useLoaderData();
  const router = useRouter();
  const { t, lang } = useLang();
  const [tab, setTab] = useState<TabId>("titles");
  const [settings, setSettings] = useState<SiteSeoSettings>(bundle.settings);
  const [busy, setBusy] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(bundle.settings),
    [settings, bundle.settings],
  );

  const patch = (part: Partial<SiteSeoSettings>) => setSettings((s) => ({ ...s, ...part }));

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await siteSeoSaveFn({ data: { settings } });
      toast.success(t("SEO settings saved.", "এসইও সেটিংস সংরক্ষিত হয়েছে।"));
      await router.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Could not save.", "সংরক্ষণ করা যায়নি।"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Page
        title={t("SEO", "এসইও")}
        description={t(
          "How your store looks in Google, plus redirects and broken-link monitoring.",
          "গুগলে আপনার স্টোর কেমন দেখাবে, সাথে রিডাইরেক্ট ও ভাঙা লিংক পর্যবেক্ষণ।",
        )}
        actions={
          (tab === "titles" ||
            tab === "sitemap" ||
            tab === "verification" ||
            tab === "analytics") && (
            <button type="button" disabled={!dirty || busy} onClick={save} className={btnPrimary}>
              {busy ? t("Saving…", "সেভ হচ্ছে…") : t("Save changes", "পরিবর্তন সেভ")}
            </button>
          )
        }
      >
        <UnderlineTabs
          label={t("SEO settings sections", "এসইও সেটিংস বিভাগ")}
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "titles", label: t("Titles & Meta", "টাইটেল ও মেটা") },
            { id: "sitemap", label: t("Sitemap", "সাইটম্যাপ") },
            { id: "verification", label: t("Verification", "ভেরিফিকেশন") },
            { id: "analytics", label: t("Pixels & Analytics", "পিক্সেল ও অ্যানালিটিক্স") },
            { id: "redirects", label: t("Redirections", "রিডাইরেকশন") },
            { id: "notfound", label: t("404 monitor", "৪০৪ মনিটর") },
          ]}
        />

        {tab === "titles" && (
          <div className="space-y-4">
            <Card title={t("Title separator", "টাইটেল সেপারেটর")}>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label={t("Title separator", "টাইটেল সেপারেটর")}
              >
                {SEPARATORS.map((sep) => (
                  <button
                    key={sep}
                    type="button"
                    aria-pressed={settings.separator === sep}
                    onClick={() => patch({ separator: sep })}
                    className={`fq-focus-glow min-h-9 min-w-9 rounded-fq-md border px-3 text-sm ${
                      settings.separator === sep
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {sep}
                  </button>
                ))}
              </div>
            </Card>

            {SEO_ENTITY_KINDS.map((kind) => {
              const tpl = settings.templates[kind];
              const setTpl = (part: Partial<typeof tpl>) =>
                patch({ templates: { ...settings.templates, [kind]: { ...tpl, ...part } } });
              const sample = applyTokens(tpl.title, {
                title: t("Example item", "উদাহরণ আইটেম"),
                sitename: bundle.storeName,
                sep: settings.separator,
                excerpt: t("A short summary of the item.", "আইটেমের সংক্ষিপ্ত বর্ণনা।"),
              });
              return (
                <Card key={kind} title={t(KIND_LABEL[kind].en, KIND_LABEL[kind].bn)}>
                  <div className="space-y-3">
                    <TokenField
                      label={t("Title template", "টাইটেল টেমপ্লেট")}
                      value={tpl.title}
                      onChange={(title) => setTpl({ title })}
                    />
                    <p className="truncate rounded-fq-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                      {t("Preview", "প্রিভিউ")}: <span className="text-foreground">{sample}</span>
                    </p>
                    <TokenField
                      label={t("Description template", "বর্ণনা টেমপ্লেট")}
                      value={tpl.description}
                      onChange={(description) => setTpl({ description })}
                      textarea
                      rows={2}
                    />
                    <div className="grid gap-1 sm:grid-cols-2">
                      <CheckboxRow
                        checked={tpl.index}
                        onChange={(index) => setTpl({ index })}
                        label={t("Show in search results", "সার্চ ফলাফলে দেখান")}
                      />
                      <CheckboxRow
                        checked={tpl.sitemap}
                        onChange={(sitemap) => setTpl({ sitemap })}
                        label={t("Include in sitemap", "সাইটম্যাপে রাখুন")}
                      />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {tab === "sitemap" && (
          <Card title={t("Sitemap", "সাইটম্যাপ")}>
            <div className="space-y-3">
              <CheckboxRow
                checked={settings.sitemap.enabled}
                onChange={(enabled) => patch({ sitemap: { ...settings.sitemap, enabled } })}
                label={t("Publish a sitemap", "সাইটম্যাপ প্রকাশ করুন")}
                hint={t(
                  "Helps search engines find every page.",
                  "সার্চ ইঞ্জিন সব পেজ খুঁজে পেতে সাহায্য করে।",
                )}
              />
              <CheckboxRow
                checked={settings.sitemap.includeImages}
                onChange={(includeImages) =>
                  patch({ sitemap: { ...settings.sitemap, includeImages } })
                }
                label={t("Include product images", "পণ্যের ছবি রাখুন")}
              />
              <CheckboxRow
                checked={settings.aiCrawlers}
                onChange={(aiCrawlers) => patch({ aiCrawlers })}
                label={t("Allow AI crawlers", "এআই ক্রলার অনুমতি")}
                hint={t(
                  "ChatGPT, Perplexity and similar assistants.",
                  "চ্যাটজিপিটি, পারপ্লেক্সিটি ইত্যাদি।",
                )}
              />
              <CheckboxRow
                checked={settings.instantIndexing}
                onChange={(instantIndexing) => patch({ instantIndexing })}
                label={t(
                  "Ping search engines when content changes",
                  "কনটেন্ট বদলালে সার্চ ইঞ্জিনকে জানান",
                )}
              />
              <label className="block max-w-[220px] space-y-1 text-xs">
                <span className="font-medium">
                  {t("URLs per sitemap file", "প্রতি ফাইলে URL সংখ্যা")}
                </span>
                <input
                  type="number"
                  min={20}
                  max={1000}
                  value={settings.sitemap.perPage}
                  onChange={(e) =>
                    patch({
                      sitemap: { ...settings.sitemap, perPage: Number(e.target.value) || 200 },
                    })
                  }
                  className={inputClass}
                />
              </label>
              {bundle.storeSlug && (
                <a
                  href={`/store/${bundle.storeSlug}/sitemap.xml`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="fq-focus-glow inline-flex min-h-9 items-center rounded-fq-md px-1 text-xs font-medium text-primary hover:underline"
                >
                  {t("Open sitemap ↗", "সাইটম্যাপ খুলুন ↗")}
                </a>
              )}
            </div>
          </Card>
        )}

        {tab === "verification" && (
          <Card title={t("Search engine verification", "সার্চ ইঞ্জিন ভেরিফিকেশন")}>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["google", t("Google Search Console", "গুগল সার্চ কনসোল")],
                  ["bing", t("Bing Webmaster Tools", "বিং ওয়েবমাস্টার")],
                  ["pinterest", t("Pinterest", "পিন্টারেস্ট")],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block space-y-1 text-xs">
                  <span className="font-medium">{label}</span>
                  <input
                    value={settings.verification[key]}
                    placeholder={t("Verification code", "ভেরিফিকেশন কোড")}
                    onChange={(e) =>
                      patch({ verification: { ...settings.verification, [key]: e.target.value } })
                    }
                    className={inputClass}
                  />
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {t(
                "Paste only the code from the meta tag — we add the tag for you.",
                "শুধু মেটা ট্যাগের কোডটুকু দিন — ট্যাগ আমরা যোগ করে দেব।",
              )}
            </p>
          </Card>
        )}

        {tab === "analytics" && (
          <Card
            title={t("Tracking Pixels & Analytics", "ট্র্যাকিং পিক্সেল ও অ্যানালিটিক্স")}
            description={t(
              "Per-customer marketing IDs and conversion tracking tokens. Stored in your isolated tenant vault, never in global environment variables.",
              "দোকান-নির্দিষ্ট মার্কেটিং আইডি ও কনভার্সন ট্র্যাকিং টোকেন। আপনার নিজস্ব টেন্যান্ট ভল্টে সংরক্ষিত থাকে, কখনোই গ্লোবাল পরিবেশ ভ্যারিয়েবলে নয়।",
            )}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1 text-xs">
                <span className="font-medium">
                  {t("Meta / Facebook Pixel ID", "মেটা / ফেসবুক পিক্সেল আইডি")}
                </span>
                <input
                  value={settings.analytics?.facebookPixelId ?? ""}
                  placeholder="e.g. 123456789012345"
                  onChange={(e) =>
                    patch({
                      analytics: {
                        ...(settings.analytics ?? {
                          facebookPixelId: "",
                          facebookCapiToken: "",
                          googleConversionUrl: "",
                          googleTagManagerId: "",
                        }),
                        facebookPixelId: e.target.value,
                      },
                    })
                  }
                  className={inputClass}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t(
                    "Used for storefront browser-side Meta Pixel tracking.",
                    "স্টোরফ্রন্ট ব্রাউজার-সাইড মেটা পিক্সেল ট্র্যাকিং এর জন্য ব্যবহৃত হয়।",
                  )}
                </p>
              </label>

              <label className="block space-y-1 text-xs">
                <span className="font-medium">
                  {t("Google Tag Manager Container ID", "গুগল ট্যাগ ম্যানেজার কনটেইনার আইডি")}
                </span>
                <input
                  value={settings.analytics?.googleTagManagerId ?? ""}
                  placeholder="e.g. GTM-XXXXXXX"
                  onChange={(e) =>
                    patch({
                      analytics: {
                        ...(settings.analytics ?? {
                          facebookPixelId: "",
                          facebookCapiToken: "",
                          googleConversionUrl: "",
                          googleTagManagerId: "",
                        }),
                        googleTagManagerId: e.target.value,
                      },
                    })
                  }
                  className={inputClass}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t(
                    "Container ID from Google Tag Manager.",
                    "গুগল ট্যাগ ম্যানেজার থেকে কনটেইনার আইডি।",
                  )}
                </p>
              </label>

              <label className="block space-y-1 text-xs sm:col-span-2">
                <span className="font-medium">
                  {t("Meta Conversions API (CAPI) Token", "মেটা কনভার্সন এপিআই (CAPI) টোকেন")}
                </span>
                <input
                  type="password"
                  value={settings.analytics?.facebookCapiToken ?? ""}
                  placeholder="EAAB..."
                  onChange={(e) =>
                    patch({
                      analytics: {
                        ...(settings.analytics ?? {
                          facebookPixelId: "",
                          facebookCapiToken: "",
                          googleConversionUrl: "",
                          googleTagManagerId: "",
                        }),
                        facebookCapiToken: e.target.value,
                      },
                    })
                  }
                  className={inputClass}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t(
                    "Server-side Conversions API token. Encrypted at rest.",
                    "সার্ভার-সাইড কনভার্সন এপিআই টোকেন। ডাটাবেজে এনক্রিপ্ট করে রাখা হয়।",
                  )}
                </p>
              </label>

              <label className="block space-y-1 text-xs sm:col-span-2">
                <span className="font-medium">
                  {t("Google Ads Conversion Tracking URL / ID", "গুগল অ্যাডস কনভার্সন ট্র্যাকিং URL / আইডি")}
                </span>
                <input
                  value={settings.analytics?.googleConversionUrl ?? ""}
                  placeholder="e.g. AW-123456789/AbCdEfGhIj"
                  onChange={(e) =>
                    patch({
                      analytics: {
                        ...(settings.analytics ?? {
                          facebookPixelId: "",
                          facebookCapiToken: "",
                          googleConversionUrl: "",
                          googleTagManagerId: "",
                        }),
                        googleConversionUrl: e.target.value,
                      },
                    })
                  }
                  className={inputClass}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t(
                    "Google Ads conversion purchase event destination.",
                    "গুগল অ্যাডস কনভার্সন পারচেস ইভেন্ট গন্তব্য।",
                  )}
                </p>
              </label>
            </div>
          </Card>
        )}

        {tab === "redirects" && (
          <RedirectsPanel rows={bundle.redirects} onDone={() => router.invalidate()} />
        )}

        {tab === "notfound" && (
          <Card title={t("404 monitor", "৪০৪ মনিটর")}>
            {bundle.notFound.length === 0 ? (
              <EmptyState
                title={t("No broken links yet", "এখনো কোনো ভাঙা লিংক নেই")}
                description={t(
                  "Addresses visitors reach that do not exist will show up here.",
                  "দর্শকরা যেসব ঠিকানায় গিয়ে কিছু পান না, সেগুলো এখানে আসবে।",
                )}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3 font-medium">{t("Address", "ঠিকানা")}</th>
                      <th className="py-2 pr-3 font-medium">{t("Hits", "হিট")}</th>
                      <th className="py-2 pr-3 font-medium">{t("Last seen", "শেষ দেখা")}</th>
                      <th className="py-2 font-medium">{t("Fix", "সমাধান")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bundle.notFound.map((row) => (
                      <NotFoundRowView key={row.id} row={row} onDone={() => router.invalidate()} />
                    ))}
                  </tbody>
                </table>
                <button
                  type="button"
                  onClick={async () => {
                    await notFoundClearFn({ data: { id: null } });
                    toast.success(t("404 log cleared.", "৪০৪ লগ মুছে ফেলা হয়েছে।"));
                    await router.invalidate();
                  }}
                  className={`${btnGhost} mt-3`}
                >
                  {t("Clear log", "লগ মুছুন")}
                </button>
              </div>
            )}
          </Card>
        )}
      </Page>
    </>
  );
}

/* ------------------------------------------------------------- redirections */

function RedirectsPanel({
  rows,
  onDone,
}: {
  rows: RedirectRow[];
  onDone: () => void | Promise<void>;
}) {
  const { t } = useLang();
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [code, setCode] = useState<301 | 302 | 307>(301);
  const [busy, setBusy] = useState(false);

  const issue = source || target ? validateRedirect(source, target) : null;
  const message =
    issue === "source"
      ? t("Enter the old address, like /old-page.", "পুরোনো ঠিকানা দিন, যেমন /old-page।")
      : issue === "target"
        ? t("Enter where visitors should land.", "দর্শকরা কোথায় যাবে তা দিন।")
        : issue === "loop"
          ? t("The two addresses are the same.", "দুটি ঠিকানা একই।")
          : null;

  async function add() {
    if (busy || validateRedirect(source, target)) return;
    setBusy(true);
    try {
      await redirectSaveFn({
        data: {
          id: null,
          sourcePath: normalisePath(source),
          targetPath: /^https?:\/\//i.test(target.trim()) ? target.trim() : normalisePath(target),
          code,
          isActive: true,
        },
      });
      setSource("");
      setTarget("");
      toast.success(t("Redirect added.", "রিডাইরেক্ট যোগ হয়েছে।"));
      await onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Could not save.", "সংরক্ষণ করা যায়নি।"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t("Redirections", "রিডাইরেকশন")}>
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_110px_auto]">
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="/old-page"
            aria-label={t("Old address", "পুরোনো ঠিকানা")}
            className={inputClass}
          />
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="/new-page"
            aria-label={t("New address", "নতুন ঠিকানা")}
            className={inputClass}
          />
          <select
            value={code}
            onChange={(e) => setCode(Number(e.target.value) as 301 | 302 | 307)}
            aria-label={t("Redirect type", "রিডাইরেক্ট ধরন")}
            className={inputClass}
          >
            {REDIRECT_CODE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || Boolean(issue) || !source}
            onClick={add}
            className={btnPrimary}
          >
            {t("Add", "যোগ")}
          </button>
        </div>
        {message && <p className="text-xs text-danger">{message}</p>}

        {rows.length === 0 ? (
          <EmptyState
            title={t("No redirects yet", "এখনো কোনো রিডাইরেক্ট নেই")}
            description={t(
              "Send visitors from an old address to a new one so no link ever breaks.",
              "পুরোনো ঠিকানা থেকে নতুন ঠিকানায় পাঠান, যেন কোনো লিংক নষ্ট না হয়।",
            )}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">{t("From", "থেকে")}</th>
                  <th className="py-2 pr-3 font-medium">{t("To", "যেখানে")}</th>
                  <th className="py-2 pr-3 font-medium">{t("Type", "ধরন")}</th>
                  <th className="py-2 pr-3 font-medium">{t("Hits", "হিট")}</th>
                  <th className="py-2 font-medium">
                    <span className="sr-only">{t("Actions", "অ্যাকশন")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="py-2 pr-3 font-mono text-xs">{row.sourcePath}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{row.targetPath}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={row.isActive ? "success" : "neutral"}>{row.code}</Badge>
                    </td>
                    <td className="fq-num py-2 pr-3 text-xs">{row.hits}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await redirectDeleteFn({ data: { id: row.id } });
                          toast.success(t("Redirect removed.", "রিডাইরেক্ট মুছে ফেলা হয়েছে।"));
                          await onDone();
                        }}
                        className="fq-focus-glow min-h-8 rounded-fq-md px-2 text-xs font-medium text-danger hover:bg-danger-soft"
                      >
                        {t("Remove", "মুছুন")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

function NotFoundRowView({
  row,
  onDone,
}: {
  row: { id: string; path: string; hits: number; lastSeenAt: string };
  onDone: () => void | Promise<void>;
}) {
  const { t } = useLang();
  const [target, setTarget] = useState("");

  return (
    <tr className="border-t border-border align-top">
      <td className="py-2 pr-3 font-mono text-xs">{row.path}</td>
      <td className="fq-num py-2 pr-3 text-xs">{row.hits}</td>
      <td className="py-2 pr-3 text-xs text-muted-foreground">
        {row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleDateString() : "—"}
      </td>
      <td className="py-2">
        <div className="flex gap-2">
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="/new-page"
            aria-label={t(`Redirect ${row.path} to`, `${row.path} যেখানে যাবে`)}
            className={inputClass}
          />
          <button
            type="button"
            disabled={!target.trim()}
            onClick={async () => {
              await notFoundRedirectFn({ data: { id: row.id, targetPath: target.trim() } });
              toast.success(t("Redirect created.", "রিডাইরেক্ট তৈরি হয়েছে।"));
              await onDone();
            }}
            className={btnGhost}
          >
            {t("Redirect", "রিডাইরেক্ট")}
          </button>
        </div>
      </td>
    </tr>
  );
}
