/**
 * Phase 2.7 — Circuit (electronics) widgets.
 *
 * Circuit sells certainty: specs, comparison, warranty, EMI, authenticity.
 * Every renderer here is theme-neutral — no theme module is imported and no
 * raw colour is written; the electronics look comes entirely from tokens.
 *
 * The hard rule of this module: **no widget performs money arithmetic**. EMI
 * instalments, bundle totals and trade-in quotes all arrive already computed
 * in integer minor units and are printed through `ctx.money`.
 */
import { useMemo, useState } from "react";
import type { SectionType } from "@/lib/builder-ast";
import type { WidgetRow } from "@/lib/widget-data";
import { useSectionChannel } from "./useSectionChannel";
import type { WidgetComponent, WidgetCtx } from "./widgets";
import { DataTable } from "./primitives/DataTable";
import { Disclosure } from "./primitives/Disclosure";
import { ProductCard } from "./primitives/ProductCard";
import { StickyBar } from "./primitives/StickyBar";
import { SpecRow, SpecValue, groupSpecs, type SpecPair } from "./primitives/SpecRow";

/* -------------------------------------------------------------- utilities */

function Skeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-9 w-full animate-pulse rounded-fq-md bg-muted" />
      ))}
    </div>
  );
}

function Panel({
  heading,
  Heading,
  children,
}: {
  heading?: string;
  Heading: "h1" | "h2";
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-fq-lg border border-border bg-card p-4">
      {heading ? <Heading className="mb-3 text-base font-semibold">{heading}</Heading> : null}
      {children}
    </section>
  );
}

/** Reads the authored `r1..rN` rows off a spec-style widget. */
export function authoredSpecs(str: (key: string) => string, count = 6): SpecPair[] {
  const out: SpecPair[] = [];
  for (let i = 1; i <= count; i += 1) {
    const label = str(`r${i}Label`).trim();
    if (!label) continue;
    const group = str(`r${i}Group`).trim();
    out.push({ key: `r${i}`, label, value: str(`r${i}Value`).trim(), ...(group ? { group } : {}) });
  }
  return out;
}

/** Server spec rows, normalised into the same pair shape. */
export function resolvedSpecs(rows: WidgetRow[] | undefined): SpecPair[] {
  return (rows ?? [])
    .filter((row) => row.title.trim())
    .map((row) => ({
      key: row.id,
      label: row.title,
      value: (row.valueText ?? "").trim(),
      ...(row.group ? { group: row.group } : {}),
      ...(row.unit ? { unit: row.unit } : {}),
    }));
}

/* ------------------------------------------------------------- spec_table */

/**
 * [U] Grouped, collapsible spec table. Resolved rows win when the source
 * returns anything; otherwise the authored rows render, so a spec table
 * authored before Phase 2.7 keeps working untouched.
 */
const SpecTable: WidgetComponent = ({ str, bool, data, Heading }) => {
  const pairs = useMemo(() => {
    const resolved = resolvedSpecs(data?.rows);
    return resolved.length ? resolved : authoredSpecs(str);
  }, [data?.rows, str]);

  if (data?.pending && pairs.length === 0) return <Skeleton lines={5} />;
  if (pairs.length === 0) return null;

  const caption = str("caption");
  const columnLabel = str("columnLabel") || "Value";
  const groups = groupSpecs(pairs);
  const grouped = bool("grouped") && groups.some((entry) => entry.group);

  if (!grouped) {
    return (
      <DataTable
        caption={caption || undefined}
        columns={[{ key: "value", label: columnLabel }]}
        rows={pairs.map((pair) => ({
          key: pair.key,
          label: pair.label,
          cells: { value: <SpecValue value={pair.value} unit={pair.unit} /> },
        }))}
      />
    );
  }

  return (
    <section className="rounded-fq-lg border border-border bg-card">
      {caption ? <Heading className="px-3 pt-3 text-sm text-muted-foreground">{caption}</Heading> : null}
      {groups.map((entry, index) => (
        <Disclosure key={entry.group || `group-${index}`} summary={entry.group || columnLabel} defaultOpen={index === 0}>
          <dl className="m-0">
            {entry.rows.map((pair) => (
              <SpecRow key={pair.key} label={pair.label} value={pair.value} unit={pair.unit} />
            ))}
          </dl>
        </Disclosure>
      ))}
    </section>
  );
};

/* -------------------------------------------------------- spec_highlights */

const SpecHighlights: WidgetComponent = ({ str, int, Heading }) => {
  const tiles = [1, 2, 3, 4, 5, 6]
    .map((i) => ({ key: `t${i}`, label: str(`t${i}Label`).trim(), value: str(`t${i}Value`).trim() }))
    .filter((tile) => tile.label && tile.value);
  if (tiles.length === 0) return null;
  const columns = int("columns", 4, 2, 6);
  return (
    <Panel heading={str("heading")} Heading={Heading}>
      <ul
        className="grid list-none gap-3 p-0"
        style={{ gridTemplateColumns: `repeat(${Math.min(columns, tiles.length)}, minmax(0, 1fr))` }}
      >
        {tiles.map((tile) => (
          <li key={tile.key} className="min-w-0 rounded-fq-md border border-border p-3">
            <p className="m-0 text-xs text-muted-foreground">{tile.label}</p>
            <p className="m-0 text-sm font-semibold tabular-nums">{tile.value}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
};

/* ------------------------------------------------------------ compare_tray */

/**
 * Sticky tray over the shared `compare` channel slot, which already caps at
 * four SKUs and survives navigation, so the tray owns no state of its own.
 */
const CompareTray: WidgetComponent = ({ str, storeSlug, data, editing }) => {
  const channel = useSectionChannel(storeSlug ?? "studio", "compare");
  const rows = data?.rows ?? [];
  const chosen = channel.ids
    .map((id) => rows.find((row) => row.id === id) ?? ({ id, title: id } as WidgetRow))
    .slice(0, 4);

  if (chosen.length === 0) {
    if (!editing) return null;
    return (
      <p className="rounded-fq-md border border-dashed border-border p-3 text-sm text-muted-foreground">
        {str("emptyText")}
      </p>
    );
  }

  return (
    <StickyBar position="bottom" visible label={str("heading")}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">{str("heading")}</span>
        <ul className="flex min-w-0 list-none flex-wrap gap-2 p-0">
          {chosen.map((row) => (
            <li key={row.id} className="flex items-center gap-2 rounded-fq-md border border-border px-2 py-1 text-sm">
              <span className="line-clamp-1 max-w-[12rem]">{row.title}</span>
              <button
                type="button"
                className="min-h-[24px] min-w-[24px] text-muted-foreground"
                onClick={() => channel.remove(row.id)}
                aria-label={`Remove ${row.title}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="ms-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => channel.clear()}
            className="min-h-[44px] rounded-fq-md border border-border px-3 text-sm"
          >
            {str("clearLabel")}
          </button>
          <a
            href={str("compareHref") || "#"}
            className="inline-flex min-h-[44px] items-center rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            {str("compareLabel")}
          </a>
        </div>
      </div>
    </StickyBar>
  );
};

/* ---------------------------------------------------------- warranty_panel */

const WarrantyPanel: WidgetComponent = ({ str, bool, int, Heading }) => {
  const months = int("months", 12, 0, 120);
  const official = bool("official");
  const centres = [1, 2, 3]
    .map((i) => ({ key: `s${i}`, name: str(`s${i}Name`).trim(), address: str(`s${i}Address`).trim() }))
    .filter((centre) => centre.name);
  return (
    <Panel heading={str("heading")} Heading={Heading}>
      <p className="m-0 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-fq-sm border border-border px-2 py-1 font-medium tabular-nums">{months}</span>
        <span className="rounded-fq-sm bg-muted px-2 py-1 text-xs">
          {official ? str("officialLabel") : str("parallelLabel")}
        </span>
      </p>
      {str("coverage") ? <p className="mt-2 text-sm text-muted-foreground">{str("coverage")}</p> : null}
      {centres.length ? (
        <dl className="mt-3 rounded-fq-md border border-border">
          {centres.map((centre) => (
            <SpecRow key={centre.key} label={centre.name} value={centre.address} />
          ))}
        </dl>
      ) : null}
    </Panel>
  );
};

/* ------------------------------------------------------ authenticity_badge */

const AuthenticityBadge: WidgetComponent = ({ str, bool }) => {
  const label = str("label").trim();
  if (!label) return null;
  const href = str("source").trim();
  return (
    <p className="m-0 flex flex-wrap items-center gap-2 rounded-fq-md border border-border bg-card px-3 py-2 text-sm">
      <span aria-hidden="true">{bool("verified") ? "✓" : "•"}</span>
      <span className="font-medium">{label}</span>
      {str("note") ? <span className="text-muted-foreground">{str("note")}</span> : null}
      {href ? (
        <a href={href} className="underline underline-offset-2">
          {href.replace(/^https?:\/\//, "")}
        </a>
      ) : null}
    </p>
  );
};

/* ----------------------------------------------------------- emi_calculator */

/**
 * Plans arrive from the `finance` source with the per-month figure already in
 * minor units; picking a tenure only changes which row is displayed.
 */
const EmiCalculator: WidgetComponent = ({ str, data, money, Heading }) => {
  const plans = (data?.rows ?? []).filter((row) => typeof row.priceMinor === "number");
  const [tenure, setTenure] = useState<string>("");
  const tenures = [...new Set(plans.map((plan) => plan.options ?? ""))].filter(Boolean);
  const active = tenure && tenures.includes(tenure) ? tenure : (tenures[0] ?? "");
  const shown = plans.filter((plan) => (plan.options ?? "") === active);

  if (data?.pending) return <Skeleton lines={3} />;
  if (plans.length === 0) {
    return (
      <Panel heading={str("heading")} Heading={Heading}>
        <p className="m-0 text-sm text-muted-foreground">{str("emptyText")}</p>
      </Panel>
    );
  }

  return (
    <Panel heading={str("heading")} Heading={Heading}>
      <div role="group" aria-label={str("heading")} className="flex flex-wrap gap-2">
        {tenures.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={value === active}
            onClick={() => setTenure(value)}
            className={`min-h-[44px] rounded-fq-md border px-3 text-sm tabular-nums ${
              value === active ? "border-primary bg-primary text-primary-foreground" : "border-border"
            }`}
          >
            {value}
          </button>
        ))}
      </div>
      <ul className="mt-3 list-none space-y-2 p-0">
        {shown.map((plan) => (
          <li key={plan.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2 last:border-b-0">
            <span className="text-sm font-medium">{plan.title}</span>
            <span className="text-sm tabular-nums">
              {money(plan.priceMinor, plan.currency)}{" "}
              <span className="text-muted-foreground">{str("perMonthLabel")}</span>
            </span>
          </li>
        ))}
      </ul>
      {str("note") ? <p className="mt-2 text-xs text-muted-foreground">{str("note")}</p> : null}
    </Panel>
  );
};

/* ---------------------------------------------------------- price_sparkline */

/** Pure: turns a minor-unit series into a 0–100 × 0–30 polyline. */
export function sparklinePath(points: number[], width = 100, height = 30): string {
  const clean = points.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return "";
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const step = width / (clean.length - 1);
  return clean
    .map((value, index) => {
      const x = Math.round(index * step * 10) / 10;
      const y = Math.round((height - ((value - min) / span) * height) * 10) / 10;
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
}

const PriceSparkline: WidgetComponent = ({ str, int, data, money, Heading }) => {
  const series = data?.rows?.[0]?.points ?? [];
  const path = sparklinePath(series);
  const lowest = series.length ? Math.min(...series) : null;
  const currency = data?.rows?.[0]?.currency;
  // The text alternative is mandatory: the chart is decoration, the sentence
  // is the content.
  const alternative =
    str("summary") ||
    (lowest === null
      ? str("emptyText")
      : `Lowest ${money(lowest, currency)} in ${int("days", 90, 7, 365)} days`);

  if (data?.pending) return <Skeleton lines={2} />;
  return (
    <Panel heading={str("heading")} Heading={Heading}>
      {path ? (
        <svg viewBox="0 0 100 30" role="presentation" aria-hidden="true" className="h-12 w-full">
          <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      ) : null}
      <p className="m-0 text-sm text-muted-foreground">{alternative}</p>
    </Panel>
  );
};

/* ----------------------------------------------------------- bundle_builder */

/**
 * Selection only. The combined total is quoted by the server once the bundle
 * reaches the cart, which is why nothing here adds two prices together.
 */
const BundleBuilder: WidgetComponent = ({ str, int, data, Heading, locale }) => {
  const rows = (data?.rows ?? []).slice(0, int("limit", 4, 2, 6));
  const [picked, setPicked] = useState<string[]>([]);
  if (data?.pending) return <Skeleton lines={3} />;
  if (rows.length === 0) return null;
  return (
    <Panel heading={str("heading")} Heading={Heading}>
      <ul className="grid list-none gap-3 p-0 sm:grid-cols-2">
        {rows.map((row) => {
          const on = picked.includes(row.id);
          return (
            <li key={row.id} className="min-w-0">
              <label className="flex items-start gap-2 rounded-fq-md border border-border p-2">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setPicked((current) =>
                      current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id],
                    )
                  }
                  className="mt-1 h-5 w-5"
                />
                <span className="min-w-0 flex-1">
                  <ProductCard row={row} locale={locale} variant="compact" />
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        disabled={picked.length === 0}
        className="mt-3 min-h-[44px] rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {str("buttonLabel")}
      </button>
      {str("note") ? <p className="mt-2 text-xs text-muted-foreground">{str("note")}</p> : null}
    </Panel>
  );
};

/* ---------------------------------------------------------------- doc_links */

const DocLinks: WidgetComponent = ({ str, Heading }) => {
  const docs = [1, 2, 3, 4]
    .map((i) => ({
      key: `d${i}`,
      label: str(`d${i}Label`).trim(),
      href: str(`d${i}Href`).trim(),
      meta: str(`d${i}Meta`).trim(),
    }))
    .filter((doc) => doc.label && doc.href);
  if (docs.length === 0) return null;
  return (
    <Panel heading={str("heading")} Heading={Heading}>
      <ul className="list-none space-y-2 p-0">
        {docs.map((doc) => (
          <li key={doc.key}>
            <a
              href={doc.href}
              className="flex min-h-[44px] items-center justify-between gap-3 rounded-fq-md border border-border px-3 text-sm"
            >
              <span className="min-w-0">{doc.label}</span>
              {doc.meta ? (
                <span dir="ltr" lang="en" className="shrink-0 text-xs text-muted-foreground">
                  {doc.meta}
                </span>
              ) : null}
            </a>
          </li>
        ))}
      </ul>
    </Panel>
  );
};

/* ------------------------------------------------------------ support_strip */

const SupportStrip: WidgetComponent = ({ str, Heading }) => {
  const tiles = [1, 2, 3, 4]
    .map((i) => ({
      key: `t${i}`,
      title: str(`t${i}Title`).trim(),
      body: str(`t${i}Body`).trim(),
      href: str(`t${i}Href`).trim(),
    }))
    .filter((tile) => tile.title);
  if (tiles.length === 0) return null;
  return (
    <Panel heading={str("heading")} Heading={Heading}>
      <ul className="grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => {
          const body = (
            <>
              <span className="block text-sm font-medium">{tile.title}</span>
              {tile.body ? <span className="block text-sm text-muted-foreground">{tile.body}</span> : null}
            </>
          );
          return (
            <li key={tile.key} className="min-w-0 rounded-fq-md border border-border p-3">
              {tile.href ? (
                <a href={tile.href} className="block min-h-[44px]">
                  {body}
                </a>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
};

/* ------------------------------------------------------------- buying_guide */

const BuyingGuide: WidgetComponent = ({ str, Heading }) => {
  const links = [1, 2, 3, 4]
    .map((i) => ({ key: `l${i}`, label: str(`l${i}Label`).trim(), href: str(`l${i}Href`).trim() }))
    .filter((link) => link.label && link.href);
  const body = str("body").trim();
  if (!body && links.length === 0) return null;
  return (
    <Panel heading={str("heading")} Heading={Heading}>
      {body ? <p className="m-0 whitespace-pre-line text-sm text-muted-foreground">{body}</p> : null}
      {links.length ? (
        <ul className="mt-3 flex list-none flex-wrap gap-2 p-0">
          {links.map((link) => (
            <li key={link.key}>
              <a
                href={link.href}
                className="inline-flex min-h-[44px] items-center rounded-fq-md border border-border px-3 text-sm"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
};

/* ------------------------------------------------------------------ trade_in */

/**
 * Collects the device, never values it. The quote is issued by the server and
 * emailed, so the widget's success state is a promise, not a figure.
 */
const TradeIn: WidgetComponent = ({ str, Heading }) => {
  const [sent, setSent] = useState(false);
  return (
    <Panel heading={str("heading")} Heading={Heading}>
      {str("body") ? <p className="m-0 text-sm text-muted-foreground">{str("body")}</p> : null}
      {sent ? (
        <p role="status" className="mt-3 text-sm">
          {str("pendingText")}
        </p>
      ) : (
        <form
          className="mt-3 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSent(true);
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block">{str("heading")}</span>
            <input
              name="device"
              required
              className="min-h-[44px] w-full rounded-fq-md border border-border bg-background px-3 text-sm"
            />
          </label>
          <button
            type="submit"
            className="min-h-[44px] rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            {str("buttonLabel")}
          </button>
          {str("consentText") ? <p className="m-0 text-xs text-muted-foreground">{str("consentText")}</p> : null}
        </form>
      )}
    </Panel>
  );
};

/* ----------------------------------------------------------------- registry */

export const CIRCUIT_WIDGETS: Record<
  Extract<
    SectionType,
    | "spec_table"
    | "spec_highlights"
    | "compare_tray"
    | "warranty_panel"
    | "authenticity_badge"
    | "emi_calculator"
    | "price_sparkline"
    | "bundle_builder"
    | "doc_links"
    | "support_strip"
    | "buying_guide"
    | "trade_in"
  >,
  WidgetComponent
> = {
  spec_table: SpecTable,
  spec_highlights: SpecHighlights,
  compare_tray: CompareTray,
  warranty_panel: WarrantyPanel,
  authenticity_badge: AuthenticityBadge,
  emi_calculator: EmiCalculator,
  price_sparkline: PriceSparkline,
  bundle_builder: BundleBuilder,
  doc_links: DocLinks,
  support_strip: SupportStrip,
  buying_guide: BuyingGuide,
  trade_in: TradeIn,
};

export type { WidgetCtx };
