import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import {
  dateCellLabel,
  formatWpDate,
  ROW_ACTION_LABEL,
  rowActions,
  seoBand,
  titleSuffixes,
  trashDaysLeft,
  type ContentRow,
  type RowAction,
} from "@/lib/content-desk";
import { editHref, previewHref } from "./content-links";

/* -------------------------------------------------------------- Title cell */

export function TitleCell({
  row,
  storeSlug,
  onAction,
}: {
  row: ContentRow;
  storeSlug: string;
  onAction: (action: RowAction, row: ContentRow) => void;
}) {
  const { lang } = useLang();
  const l = lang === "bn" ? "bn" : "en";
  const suffixes = titleSuffixes(row, l);
  const actions = rowActions(row);
  const isTrash = row.status === "trash";

  return (
    <div className="min-w-[18rem]">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
        {isTrash ? (
          <span className="font-semibold text-foreground">{row.title || "(no title)"}</span>
        ) : (
          <Link
            to={editHref(row.kind, row.id) as never}
            className="fq-focus-glow inline-flex min-h-8 items-center rounded-fq-sm font-semibold text-foreground outline-none hover:underline sm:min-h-0"
          >
            {row.title || "(no title)"}
          </Link>
        )}
        {suffixes.map((s) => (
          <span key={s} className="text-sm fq-sub">
            — {s}
          </span>
        ))}
      </div>
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className={cn(
          "mt-0.5 flex flex-wrap items-center gap-x-1 whitespace-nowrap text-[13px] leading-5 transition-opacity duration-150",
          "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 group-focus:opacity-100 [@media(hover:none)]:opacity-100",
        )}
      >
        {actions.map((a, i) => (
          <span key={a} className="flex items-center">
            {i > 0 ? <span aria-hidden className="mx-1 text-border">|</span> : null}
            <RowActionLink action={a} row={row} storeSlug={storeSlug} onAction={onAction} />
          </span>
        ))}
        {isTrash ? (
          <span className="ml-2 text-xs fq-sub">
            {l === "bn"
              ? `${trashDaysLeft(row.trashedAt)} দিনে স্থায়ীভাবে মুছে যাবে`
              : `Deleted permanently in ${trashDaysLeft(row.trashedAt)} days`}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function RowActionLink({
  action,
  row,
  storeSlug,
  onAction,
}: {
  action: RowAction;
  row: ContentRow;
  storeSlug: string;
  onAction: (action: RowAction, row: ContentRow) => void;
}) {
  const { lang } = useLang();
  const label = ROW_ACTION_LABEL[action][lang === "bn" ? "bn" : "en"];
  const danger = action === "trash" || action === "delete";
  // ≥32px tall on touch layouts (WCAG 2.5.8); collapses to text height on desktop where hover reveals it.
  const base = cn(
    "fq-focus-glow inline-flex min-h-8 items-center rounded-fq-sm px-0.5 outline-none hover:underline sm:min-h-0",
    danger ? "text-[var(--fq-danger)]" : "text-primary",
  );

  if (action === "edit" || action === "edit-builder") {
    return (
      <Link
        to={editHref(row.kind, row.id, action === "edit-builder" ? "builder" : undefined) as never}
        className={base}
      >
        {label}
      </Link>
    );
  }
  if (action === "preview" || action === "view") {
    return (
      <a href={previewHref(row.kind, row, storeSlug)} target="_blank" rel="noreferrer" className={cn(base, "inline-flex items-center gap-0.5")}>
        {label}
        <ExternalLink aria-hidden className="size-3" />
      </a>
    );
  }
  return (
    <button type="button" onClick={() => onAction(action, row)} className={base} aria-label={`${label}: ${row.title}`}>
      {label}
    </button>
  );
}

/* ---------------------------------------------------------------- SEO cell */

const BAND_DOT = {
  great: "bg-[var(--fq-success)]",
  good: "bg-[var(--fq-warning)]",
  poor: "bg-[var(--fq-danger)]",
} as const;

const BAND_WORD = {
  great: { en: "Great", bn: "চমৎকার" },
  good: { en: "Good", bn: "ভালো" },
  poor: { en: "Poor", bn: "দুর্বল" },
} as const;

export function SeoCell({ seo }: { seo: ContentRow["seo"] }) {
  const { lang } = useLang();
  const l = lang === "bn" ? "bn" : "en";
  const band = seoBand(seo.score);
  const tip = seo.failing.length
    ? `${BAND_WORD[band][l]} · ${seo.score}/100\n${seo.failing.map((f) => `✗ ${f}`).join("\n")}`
    : `${BAND_WORD[band][l]} · ${seo.score}/100`;
  return (
    <div className="flex min-w-0 items-center gap-2" title={tip}>
      <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", BAND_DOT[band])} />
      <span className="fq-num text-sm text-foreground">{seo.score}</span>
      <span className="sr-only">{BAND_WORD[band][l]}</span>
      <span className="truncate text-xs fq-sub">
        {seo.focusKeyword || (l === "bn" ? "কীওয়ার্ড নেই" : "No focus keyword")}
      </span>
    </div>
  );
}

/* --------------------------------------------------------------- Date cell */

export function DateCell({ row }: { row: ContentRow }) {
  const { lang } = useLang();
  const l = lang === "bn" ? "bn" : "en";
  const { label, iso } = dateCellLabel(row);
  const when = iso ?? row.updatedAt;
  return (
    <div className="leading-5">
      <div className="text-sm text-foreground">{label[l]}</div>
      <time dateTime={when} className="fq-num block text-xs fq-sub">
        {formatWpDate(when)}
      </time>
    </div>
  );
}

/* ------------------------------------------------------------- Author cell */

export function AuthorCell({ name }: { name: string | null }) {
  return <span className={cn("text-sm", name ? "text-foreground" : "fq-sub")}>{name ?? "—"}</span>;
}

/* -------------------------------------------------------------- Terms cell */

export function TermsCell({ items, emptyLabel }: { items: readonly string[]; emptyLabel: string }) {
  if (items.length === 0) return <span className="text-sm fq-sub">{emptyLabel}</span>;
  return (
    <span className="text-sm text-foreground">
      {items.map((it, i) => (
        <span key={it}>
          {i > 0 ? ", " : ""}
          {it}
        </span>
      ))}
    </span>
  );
}
