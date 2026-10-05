/**
 * Songoskriti footer proof presentation — theme-owned (PROOF lane).
 *
 * Claims the `songoskriti × footer_sitemap` pair through
 * `registerThemePresentation` (first-wins, never throws).
 * `SongoskritiFooterProof` is pure markup over the shared merchant
 * `FooterData` (type-only import — erased at runtime): a heritage 4-column
 * grid of `<section>` blocks. Same columns, labels, hrefs and accessible
 * attributes as every theme — only this structure differs.
 *
 * This module is intentionally separate from any sibling `footer-*` draft:
 * it is the PROOF lane's minimal registration, and the proof test resolves
 * it through the registry (never by direct import of another theme file).
 * Names only its own key — no theme branch lives here.
 */
import { parsePickedHandles } from "@/lib/builder-ast";
import { registerThemePresentation } from "@/lib/theme-presentations";
import type { WidgetComponent } from "@/components/builder/widgets";
import type { FooterData } from "@/components/store/StoreFooterMenus";

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
 * Heritage grid over shared merchant data. Heading-only columns (href
 * `"#"` or empty) render a `<p>` heading, never a link — the same rule the
 * shared renderer follows, so identical data renders identical affordances.
 */
export function SongoskritiFooterProof({
  data,
  label,
}: {
  data: FooterData;
  /** Localised nav label (hooks stay in the caller; this is pure markup). */
  label: string;
}) {
  return (
    <nav aria-label={label} className="border-t border-[#eaeaea] bg-transparent">
      <div
        data-footer-presentation="songoskriti-proof"
        className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:grid-cols-2 lg:grid-cols-4"
      >
        {data.columns.map((column) => (
          <section key={column.id} className="min-w-0">
            {column.href && column.href !== "#" ? (
              <a
                href={column.href}
                title={column.titleAttr || undefined}
                {...proofNewTabProps(column.newTab)}
                className="mb-6 block text-[11px] font-medium uppercase tracking-[0.2em] text-foreground transition-colors hover:text-foreground/70"
              >
                {column.label}
              </a>
            ) : (
              <p className="mb-6 text-[11px] font-medium uppercase tracking-[0.2em] text-foreground">
                {column.label}
              </p>
            )}
            {column.links.length > 0 && (
              <ul className="space-y-4">
                {column.links.map((link) => (
                  <li key={link.id}>
                    <a
                      href={link.href}
                      title={link.titleAttr || undefined}
                      {...proofNewTabProps(link.newTab)}
                      className="font-serif text-[15px] font-light text-foreground/70 transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
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
  const raw =
    ctx.locale === "bn" && linksBnRaw.trim() ? linksBnRaw : linksRaw;
  return proofLinksOf(raw);
}

/** Section props → shared merchant data (repeater-first, scalar fallback). */
function songoskritiProofFooterDataOf(
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

export const SongoskritiFooterProofPresentation: WidgetComponent = (ctx) => {
  const data = songoskritiProofFooterDataOf(ctx);
  if (data.isEmpty) return null;
  return (
    <SongoskritiFooterProof
      data={data}
      label={ctx.locale === "bn" ? "ফুটার মেনু" : "Footer menu"}
    />
  );
};

registerThemePresentation(
  "songoskriti",
  "footer_sitemap",
  SongoskritiFooterProofPresentation,
);
