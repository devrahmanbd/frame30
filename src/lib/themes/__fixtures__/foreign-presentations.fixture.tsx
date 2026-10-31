/**
 * Synthetic foreign-theme presentations (test fixture only — NOT a shipped
 * theme).
 *
 * The official catalogue now ships exactly one theme, Songoskriti. The
 * library-level cross-theme property — two presentations consuming one
 * shared data contract and producing different chrome — is still worth
 * pinning, so these presentations are an in-repo fixture that copies the
 * retired second-theme chrome verbatim. They are registered only by the
 * proof suites that import them; no production graph imports this file.
 *
 * Data handling stays platform-owned (`announcementItemsOf` /
 * `useAnnouncementState` and the shared `FooterData` shape); the fixture
 * owns chrome only.
 */
import {
  announcementItemsOf,
  announcementMotionOf,
  useAnnouncementState,
} from "@/components/store/AnnouncementBar";
import { parsePickedHandles } from "@/lib/builder-ast";
import type { WidgetComponent } from "@/components/builder/widgets";
import type { FooterData } from "@/components/store/StoreFooterMenus";

export const FOREIGN_THEME_KEY = "acme-pack";

const FOREIGN_STEP_BTN =
  "flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-fq-sm text-base leading-none text-[var(--theme-ink)]/50 motion-safe:transition-colors hover:text-[var(--theme-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current";

export const ForeignAnnouncementPresentation: WidgetComponent = (ctx) => {
  const items = announcementItemsOf(
    ctx.section.props as Record<string, unknown>,
  );
  const state = useAnnouncementState({
    items,
    locale: ctx.locale,
    href: ctx.str("href") || undefined,
    dismissible: ctx.bool("dismissible"),
    rotateMs: ctx.int("rotateMs", 6000, 0, 60000),
    motion: announcementMotionOf(ctx.str("motion")) ?? "rotating",
    link: ctx.link,
    storageKey: `fq-announcement:${ctx.section.id}`,
  });
  if (!state.active) return null;
  const { active, visible, labels, linkHref, target } = state;
  return (
    <section
      data-announcement-presentation="acme-pack"
      className="border-b border-dashed border-[var(--theme-border)] bg-[var(--theme-surface)]"
    >
      <div
        role="region"
        aria-label={labels.region}
        className="flex items-center justify-start gap-2 px-4 py-1.5 sm:px-6"
      >
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-[var(--theme-ink)]/40"
        />
        {visible.length > 1 && (
          <button
            type="button"
            onClick={() => state.step(-1)}
            aria-label={labels.prev}
            className={FOREIGN_STEP_BTN}
          >
            <span aria-hidden="true">‹</span>
          </button>
        )}
        <p
          aria-live="polite"
          className="min-w-0 flex-1 whitespace-normal text-left font-sans text-xs font-medium text-[var(--theme-ink)]"
        >
          {target ? (
            <a
              href={linkHref}
              className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
            >
              {active.text}
            </a>
          ) : (
            active.text
          )}
        </p>
        {visible.length > 1 && (
          <button
            type="button"
            onClick={() => state.step(1)}
            aria-label={labels.next}
            className={FOREIGN_STEP_BTN}
          >
            <span aria-hidden="true">›</span>
          </button>
        )}
        {state.dismissible && (
          <button
            type="button"
            onClick={() => state.dismiss(active.id)}
            aria-label={labels.dismiss}
            className={FOREIGN_STEP_BTN}
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
      </div>
    </section>
  );
};

/**
 * `Label|/href` link list: legacy comma-separated AND newline row formats,
 * bare labels get href `"#"`, malformed pairs dropped, capped at 8.
 */
function proofLinksOf(raw: string): { label: string; href: string }[] {
  return raw
    .split(/[\r\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [label, href] = part.split("|");
      return { label: (label ?? "").trim(), href: (href ?? "").trim() || "#" };
    })
    .filter((link) => link.label.length > 0)
    .slice(0, 8);
}

/** Shared heading target/rel spread: new-tab nodes open externally. */
function proofNewTabProps(newTab: boolean) {
  return newTab ? { target: "_blank", rel: "noreferrer" } : {};
}

/**
 * Everyday stack over shared merchant data. Heading-only columns (href
 * `"#"` or empty) render a `<p>` heading, never a link — the same rule the
 * shared renderer follows, so identical data renders identical affordances.
 */
export function ForeignFooterProof({
  data,
  label,
}: {
  data: FooterData;
  /** Localised nav label (hooks stay in the caller; this is pure markup). */
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="border-t border-[#eaeaea] bg-transparent"
    >
      <ul
        data-footer-presentation="acme-pack-proof"
        className="mx-auto max-w-6xl space-y-10 px-4 py-16"
      >
        {data.columns.map((column) => (
          <li
            key={column.id}
            className="min-w-0 border-b border-dashed border-[var(--theme-border)] pb-8 last:border-0"
          >
            {column.href && column.href !== "#" ? (
              <a
                href={column.href}
                title={column.titleAttr || undefined}
                {...proofNewTabProps(column.newTab)}
                className="mb-4 block text-xs font-semibold uppercase tracking-widest text-foreground transition-colors hover:text-foreground/70"
              >
                {column.label}
              </a>
            ) : (
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-foreground">
                {column.label}
              </p>
            )}
            {column.links.length > 0 && (
              <ul className="flex flex-wrap gap-x-6 gap-y-2">
                {column.links.map((link) => (
                  <li key={link.id}>
                    <a
                      href={link.href}
                      title={link.titleAttr || undefined}
                      {...proofNewTabProps(link.newTab)}
                      className="text-sm text-foreground/70 underline-offset-4 transition-colors hover:text-foreground hover:underline"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Scalar column key pairs (c1..c4 titles + link lists). */
const FOOTER_COLUMNS: { title: string; links: string }[] = [
  { title: "c1Title", links: "c1Links" },
  { title: "c2Title", links: "c2Links" },
  { title: "c3Title", links: "c3Links" },
  { title: "c4Title", links: "c4Links" },
];

function proofTitleOf(
  ctx: Parameters<WidgetComponent>[0],
  row: Record<string, unknown>,
): string {
  const title = typeof row.title === "string" ? row.title : "";
  const titleBn = typeof row.title_bn === "string" ? row.title_bn : "";
  return ctx.locale === "bn" && titleBn ? titleBn : title;
}

function proofRowLinksOf(
  ctx: Parameters<WidgetComponent>[0],
  row: Record<string, unknown>,
): { label: string; href: string }[] {
  const linksRaw = typeof row.links === "string" ? row.links : "";
  const linksBnRaw = typeof row.links_bn === "string" ? row.links_bn : "";
  const raw = ctx.locale === "bn" && linksBnRaw.trim() ? linksBnRaw : linksRaw;
  return proofLinksOf(raw);
}

/** Section props → shared merchant data (repeater-first, scalar fallback). */
function foreignProofFooterDataOf(
  ctx: Parameters<WidgetComponent>[0],
): FooterData {
  const itemRows = Array.isArray(ctx.section.props.items)
    ? ctx.section.props.items
        .map((row, index) => {
          const r = row as Record<string, unknown>;
          const title = proofTitleOf(ctx, r);
          const links = proofRowLinksOf(ctx, r).map((link, i) => ({
            id: `items-${index}-${i}`,
            label: link.label,
            href: ctx.link(link.href),
          }));
          return { id: `items-${index}`, title, links };
        })
        .filter((col) => col.title.trim() || col.links.length > 0)
    : [];
  const scalarCols =
    itemRows.length > 0
      ? []
      : FOOTER_COLUMNS.map((col, index) => {
          const title = ctx.str(col.title);
          const links = proofLinksOf(ctx.str(col.links)).map((link, i) => ({
            id: `c${index + 1}-${i}`,
            label: link.label,
            href: ctx.link(link.href),
          }));
          return { id: `c${index + 1}`, title, links };
        }).filter((col) => col.title.trim() || col.links.length > 0);
  const base = itemRows.length > 0 ? itemRows : scalarCols;
  const pageSlugs = parsePickedHandles(ctx.str("pages"));
  const columns = [
    ...base.map((col) => ({
      id: col.id,
      label: col.title,
      href: "#",
      titleAttr: "",
      newTab: false,
      links: col.links.map((link) => ({
        ...link,
        titleAttr: "",
        newTab: false,
      })),
    })),
    ...(pageSlugs.length === 0
      ? []
      : [
          {
            id: "pages",
            label: ctx.locale === "bn" ? "পাতা" : "Pages",
            href: "#",
            titleAttr: "",
            newTab: false,
            links: pageSlugs.map((slug, i) => ({
              id: `pages-${i}`,
              label: slug
                .split("-")
                .filter(Boolean)
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" "),
              href: ctx.link(`/pages/${slug}`),
              titleAttr: "",
              newTab: false,
            })),
          },
        ]),
  ];
  return {
    columns,
    isEmpty: columns.length === 0,
    mobileAccordion: { expandedId: null },
  };
}

export const ForeignFooterProofPresentation: WidgetComponent = (ctx) => {
  const data = foreignProofFooterDataOf(ctx);
  if (data.isEmpty) return null;
  return (
    <ForeignFooterProof
      data={data}
      label={ctx.locale === "bn" ? "ফুটার মেনু" : "Footer menu"}
    />
  );
};
