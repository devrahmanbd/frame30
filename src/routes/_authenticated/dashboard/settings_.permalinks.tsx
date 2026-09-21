/**
 * `/dashboard/settings/permalinks`: post URL structure (WP parity).
 *
 * Presets (Plain, Day+name, Month+name, Numeric, Post name, Custom) with
 * template tags, category/tag bases, and a live example. Applies to store
 * posts; products and pages keep fixed shapes in v1.
 */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, Page, btnPrimary, inputClass } from "@/components/console/kit";
import { useLang } from "@/lib/i18n";
import {
  PERMALINK_PRESETS,
  buildPostUrl,
  type PermalinkKind,
} from "@/lib/permalinks";
import {
  permalinkGetFn,
  permalinkSetFn,
} from "@/lib/content-desk.functions";

export const Route = createFileRoute(
  "/_authenticated/dashboard/settings_/permalinks",
)({
  loader: () => permalinkGetFn(),
  head: () => ({
    meta: [
      { title: "Permalink settings — Framique admin" },
      {
        name: "description",
        content: "URL structure for store posts, with day, name and custom-tag options.",
      },
      { property: "og:title", content: "Permalink settings — Framique admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PermalinkSettingsPage,
});

const TAGS = [
  "%year%",
  "%monthnum%",
  "%day%",
  "%hour%",
  "%minute%",
  "%second%",
  "%post_id%",
  "%postname%",
  "%category%",
  "%author%",
];

const EXAMPLE = {
  postname: "sample-post",
  dateISO: "2026-09-21T10:00:00Z",
  category: "news",
  author: "shop-owner",
  post_id: 123,
};

function PermalinkSettingsPage() {
  const { t } = useLang();
  const initial = Route.useLoaderData();
  const [kind, setKind] = useState<PermalinkKind>(initial.kind);
  const [custom, setCustom] = useState(initial.custom ?? "");
  const [categoryBase, setCategoryBase] = useState(
    initial.categoryBase ?? "",
  );
  const [tagBase, setTagBase] = useState(initial.tagBase ?? "");
  const saveFn = useServerFn(permalinkSetFn);

  const example = useMemo(
    () =>
      buildPostUrl({ kind, custom: custom || undefined }, EXAMPLE),
    [kind, custom],
  );

  const save = useMutation({
    mutationFn: (data: {
      kind: PermalinkKind;
      custom?: string;
      categoryBase?: string;
      tagBase?: string;
    }) => saveFn({ data }),
    onSuccess: () => toast.success(t("Saved", "সংরক্ষিত হয়েছে")),
    onError: () => toast.error(t("Could not save", "সংরক্ষণ হয়নি")),
  });

  return (
    <Page
      title={t("Permalink Settings", "পার্মালিংক সেটিংস")}
      description={t(
        "URL structure for store posts. Post name links are easiest to understand.",
        "স্টোর পোস্টের URL কাঠামো।",
      )}
    >
      <div className="grid gap-4">
        <Card title={t("Common Settings", "সাধারণ সেটিংস")}>
          <div className="space-y-2" role="radiogroup" aria-label="Permalink structure">
            {PERMALINK_PRESETS.map((p) => (
              <label
                key={p.kind}
                className="flex cursor-pointer items-center gap-3 rounded-fq-md border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                <input
                  type="radio"
                  name="permalink-kind"
                  checked={kind === p.kind}
                  onChange={() => setKind(p.kind)}
                  className="size-4"
                />
                <span className="font-medium">{p.label}</span>
                <code className="ml-auto text-xs text-muted-foreground">
                  {p.kind === "custom" ? custom || p.example : p.example}
                </code>
              </label>
            ))}
          </div>
          {kind === "custom" && (
            <div className="mt-4 space-y-2">
              <label className="block text-sm font-medium" htmlFor="pl-custom">
                {t("Custom Structure", "কাস্টম কাঠামো")}
              </label>
              <input
                id="pl-custom"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="/%year%/%monthnum%/%postname%/"
                className={inputClass}
              />
              <div className="flex flex-wrap gap-1.5">
                {TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setCustom((c) => `${c}${tag}`)}
                    className="rounded-full border border-border px-2 py-0.5 font-mono text-xs hover:bg-muted"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            {t("Example post URL:", "উদাহরণ পোস্ট URL:")}{" "}
            <code className="font-mono">{example}</code>
          </p>
        </Card>

        <Card title={t("Optional", "ঐচ্ছিক")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Category base</span>
              <input
                value={categoryBase}
                onChange={(e) => setCategoryBase(e.target.value)}
                placeholder="topics"
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Tag base</span>
              <input
                value={tagBase}
                onChange={(e) => setTagBase(e.target.value)}
                placeholder="tags"
                className={inputClass}
              />
            </label>
          </div>
        </Card>

        <div>
          <button
            type="button"
            onClick={() =>
              save.mutate({
                kind,
                custom: custom || undefined,
                categoryBase: categoryBase || undefined,
                tagBase: tagBase || undefined,
              })
            }
            disabled={save.isPending}
            className={btnPrimary}
          >
            {save.isPending
              ? t("Saving…", "সংরক্ষণ হচ্ছে…")
              : t("Save Changes", "পরিবর্তন সংরক্ষণ করুন")}
          </button>
        </div>
      </div>
    </Page>
  );
}
