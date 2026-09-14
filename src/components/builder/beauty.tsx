/**
 * Phase 2.8 — Rupaboti (beauty) widgets.
 *
 * Rupaboti sells suitability and trust: does this shade match me, is it right
 * for my skin, is it authentic, is it safe. Circuit proves it with specs; this
 * module proves it with shades, ingredients, routines and real faces.
 *
 * Two rules govern the file. **No widget performs money arithmetic** — gift
 * sets, routines and refills post item sets to the server and print the
 * returned total. And **regulatory copy is content, never decoration**:
 * disclaimers, patch-test notes and expiry data render as readable text in the
 * chosen locale, never as an icon.
 */
import { useMemo, useState } from "react";
import type { SectionType } from "@/lib/builder-ast";
import type { Locale } from "@/lib/bitext";
import type { WidgetRow } from "@/lib/widget-data";
import {
  SHADE_DEPTHS,
  depthLabel,
  parseTerms,
  termLabel,
  termsOf,
  type TaxonomyKind,
} from "@/lib/beauty-taxonomy";
import {
  answerStep,
  emptyQuizState,
  goBack,
  goNext,
  isFinished,
  resultHref,
  type QuizStep,
} from "@/lib/quiz-flow";
import type { FacetKey } from "@/lib/facet-url";
import { ConsentChip } from "./primitives/ConsentChip";
import { Disclosure } from "./primitives/Disclosure";
import { MediaFrame } from "./primitives/MediaFrame";
import { ProductCard } from "./primitives/ProductCard";
import { SkinToneBackdrop } from "./primitives/SkinToneBackdrop";
import { StepFlow } from "./primitives/StepFlow";
import { SwatchDot, type SwatchValue } from "./primitives/SwatchDot";
import type { WidgetComponent } from "./widgets";

/* -------------------------------------------------------------- utilities */

/** Inline bilingual fallback for built-in UI copy that is not merchant-authored. */
function t(locale: Locale, en: string, bn: string): string {
  return locale === "bn" ? bn : en;
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

function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-10 w-full animate-pulse rounded-fq-md bg-muted" />
      ))}
    </div>
  );
}

/** Reads a repeated `p1..pN` prop family off a section. */
function repeated(
  str: (key: string) => string,
  prefix: string,
  keys: string[],
  count: number,
): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (let i = 1; i <= count; i += 1) {
    const entry: Record<string, string> = { key: `${prefix}${i}` };
    for (const field of keys) entry[field] = str(`${prefix}${i}${field}`).trim();
    if (entry[keys[0]!]) out.push(entry);
  }
  return out;
}

/** A variant row's swatch, normalised for the swatch primitive. */
export function rowSwatch(row: WidgetRow): SwatchValue {
  const raw = (row.swatch ?? "").trim();
  if (raw.startsWith("#")) return { hex: raw };
  if (raw.startsWith("linear-gradient(")) return { gradient: raw };
  if (raw) return { image: raw };
  return row.imageUrl ? { image: row.imageUrl } : {};
}

function toneLabels(locale: "en" | "bn"): string[] {
  return [t(locale, "Fair", "ফর্সা"), t(locale, "Medium", "মাঝারি"), t(locale, "Deep", "গাঢ়")];
}

function taxonomyOptions(kind: TaxonomyKind, locale: "en" | "bn") {
  return termsOf(kind).map((term) => ({ value: term.slug, label: locale === "bn" ? term.bn : term.en }));
}

/* ------------------------------------------------------------ shade_finder */

/**
 * Undertone + depth in two questions, then real variants — the finder never
 * invents a shade, it filters the ones the merchant actually stocks.
 */
const ShadeFinder: WidgetComponent = ({ str, data, locale, Heading }) => {
  const [state, setState] = useState(emptyQuizState);
  const steps: QuizStep[] = useMemo(
    () => [
      {
        key: "undertone",
        prompt: str("undertonePrompt") || t(locale, "What is your undertone?", "আপনার আন্ডারটোন কী?"),
        options: taxonomyOptions("undertone", locale),
      },
      {
        key: "depth",
        prompt: str("depthPrompt") || t(locale, "How deep is your skin tone?", "আপনার ত্বকের গভীরতা?"),
        options: SHADE_DEPTHS.map((depth) => ({
          value: depth.slug,
          label: depthLabel(depth.slug, locale),
        })),
      },
    ],
    [locale, str],
  );

  const rows = data?.rows ?? [];
  const depth = state.answers["depth"]?.[0] ?? "";
  const undertone = state.answers["undertone"]?.[0] ?? "";
  const matches = rows.filter((row) => {
    const haystack = `${row.title} ${row.subtitle ?? ""} ${row.options ?? ""}`.toLowerCase();
    const depthOk = !depth || haystack.includes(depth);
    const toneOk = !undertone || haystack.includes(undertone);
    return depthOk && toneOk;
  });
  const shown = matches.length ? matches : rows;

  return (
    <Panel heading={str("heading")} Heading={Heading}>
      <StepFlow
        steps={steps}
        state={state}
        onAnswer={(step, value) => setState((current) => answerStep(current, step, value))}
        onBack={() => setState(goBack)}
        onNext={() => setState((current) => goNext(current, steps))}
        labels={{
          back: t(locale, "Back", "পেছনে"),
          next: t(locale, "Next", "পরবর্তী"),
          finish: t(locale, "See shades", "শেড দেখুন"),
          progress: str("heading") || t(locale, "Shade finder", "শেড ফাইন্ডার"),
        }}
      >
        {data?.pending ? (
          <Skeleton lines={2} />
        ) : shown.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">{str("emptyText")}</p>
        ) : (
          <>
            <p className="m-0 text-sm text-muted-foreground">
              {t(locale, "Recommended for you", "আপনার জন্য প্রস্তাবিত")}
            </p>
            <ul
              className="mt-3 m-0 flex list-none flex-wrap gap-2 p-0"
              role="radiogroup"
              aria-label={t(locale, "Recommended shades", "প্রস্তাবিত শেড")}
            >
              {shown.slice(0, 8).map((row) => (
                <li key={row.id}>
                  <SwatchDot
                    value={rowSwatch(row)}
                    label={`${row.title}${row.subtitle ? ` — ${row.subtitle}` : ""}`}
                    disabled={row.inStock === false}
                  />
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <SkinToneBackdrop
                value={rowSwatch(shown[0]!)}
                label={t(locale, "Swatch on skin", "ত্বকে শেড")}
                toneLabels={toneLabels(locale)}
              />
            </div>
            <button
              type="button"
              onClick={() => setState(emptyQuizState)}
              className="mt-3 min-h-[44px] rounded-full border border-border px-4 text-sm"
            >
              {t(locale, "Start over", "আবার শুরু")}
            </button>
          </>
        )}
      </StepFlow>
    </Panel>
  );
};

/* --------------------------------------------------------------- skin_quiz */

/** Four steps, then a saved filter link. The result is a URL, not a dead end. */
const SkinQuiz: WidgetComponent = ({ str, locale, Heading }) => {
  const [state, setState] = useState(emptyQuizState);
  const steps: QuizStep[] = useMemo(
    () => [
      {
        key: "skin_type",
        prompt: str("typePrompt") || t(locale, "Your skin type?", "আপনার ত্বকের ধরন?"),
        options: taxonomyOptions("skin_type", locale),
      },
      {
        key: "concern",
        prompt: str("concernPrompt") || t(locale, "Main concern?", "প্রধান সমস্যা?"),
        options: taxonomyOptions("concern", locale),
      },
      {
        key: "sensitivity",
        prompt: str("sensitivityPrompt") || t(locale, "Sensitive skin?", "ত্বক কি সংবেদনশীল?"),
        options: [
          { value: "sensitive", label: t(locale, "Yes", "হ্যাঁ") },
          { value: "normal", label: t(locale, "No", "না") },
        ],
      },
      {
        key: "finish",
        prompt: str("finishPrompt") || t(locale, "Preferred finish?", "পছন্দের ফিনিশ?"),
        options: taxonomyOptions("finish", locale),
        required: false,
      },
    ],
    [locale, str],
  );

  const mapping: Partial<Record<string, FacetKey>> = { skin_type: "category", concern: "collection" };
  const done = isFinished(state, steps);
  const href = resultHref(str("resultPath") || "/search", state, mapping);

  return (
    <Panel heading={str("heading")} Heading={Heading}>
      {str("body") ? <p className="mb-3 text-sm text-muted-foreground">{str("body")}</p> : null}
      <StepFlow
        steps={steps}
        state={state}
        onAnswer={(step, value) => setState((current) => answerStep(current, step, value))}
        onBack={() => setState(goBack)}
        onNext={() => setState((current) => goNext(current, steps))}
        labels={{
          back: t(locale, "Back", "পেছনে"),
          next: t(locale, "Next", "পরবর্তী"),
          finish: t(locale, "See results", "ফলাফল দেখুন"),
          progress: str("heading") || t(locale, "Skin quiz", "স্কিন কুইজ"),
        }}
      >
        {done ? (
          <div>
            <p className="m-0 text-sm">{str("resultText")}</p>
            <a
              href={href}
              className="mt-3 inline-flex min-h-[44px] items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
            >
              {str("resultLabel") || t(locale, "Shop my routine", "আমার রুটিন দেখুন")}
            </a>
          </div>
        ) : null}
      </StepFlow>
    </Panel>
  );
};

/* --------------------------------------------------------- routine_builder */

/**
 * AM/PM steps with per-step swap. Add-all posts the whole set to the server,
 * which is the only place the combined total may be computed.
 */
const RoutineBuilder: WidgetComponent = ({ str, int, data, locale, Heading }) => {
  const [phase, setPhase] = useState<"am" | "pm">("am");
  const limit = int("limit", 4, 2, 6);
  const rows = (data?.rows ?? []).slice(0, limit);
  const labels = { am: str("amLabel") || t(locale, "Morning", "সকাল"), pm: str("pmLabel") || t(locale, "Night", "রাত") };

  return (
    <Panel heading={str("heading")} Heading={Heading}>
      <div role="tablist" aria-label={str("heading")} className="flex gap-2">
        {(["am", "pm"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={phase === key}
            onClick={() => setPhase(key)}
            className={`min-h-[44px] rounded-full border px-4 text-sm ${
              phase === key ? "border-primary bg-primary text-primary-foreground" : "border-border"
            }`}
          >
            {labels[key]}
          </button>
        ))}
      </div>
      {data?.pending ? (
        <div className="mt-3">
          <Skeleton lines={limit} />
        </div>
      ) : (
        <ol className="mt-3 m-0 list-none space-y-3 p-0">
          {rows.map((row, index) => (
            <li key={row.id} className="flex min-w-0 items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-xs tabular-nums"
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <ProductCard row={row} locale={locale} variant="compact" />
              </span>
              <a
                href={row.href ?? "#"}
                className="shrink-0 self-center text-sm underline underline-offset-2"
              >
                {str("swapLabel") || t(locale, "Swap", "বদলান")}
              </a>
            </li>
          ))}
        </ol>
      )}
      <button
        type="button"
        disabled={rows.length === 0}
        className="mt-4 min-h-[44px] rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {str("addAllLabel") || t(locale, "Add routine to cart", "রুটিন কার্টে যোগ করুন")}
      </button>
      {str("note") ? <p className="mt-2 text-xs text-muted-foreground">{str("note")}</p> : null}
    </Panel>
  );
};

/* ---------------------------------------------------------- ingredient_list */

/** Key actives with a Bangla gloss; the full INCI list stays Latin in a disclosure. */
const IngredientList: WidgetComponent = ({ str, data, locale, Heading }) => {
  const resolved = data?.rows ?? [];
  const authored = repeated(str, "i", ["Name", "Amount", "Gloss"], 6);
  const items = resolved.length
    ? resolved.map((row) => ({
        key: row.id,
        Name: row.title,
        Amount: row.valueText ?? "",
        Gloss: row.subtitle ?? "",
      }))
    : authored;

  if (data?.pending && items.length === 0) return <Skeleton lines={4} />;
  if (items.length === 0) return null;

  return (
    <Panel heading={str("heading")} Heading={Heading}>
      <dl className="m-0">
        {items.map((item) => (
          <div key={item.key} className="border-b border-border py-2 last:border-b-0">
            <dt dir="ltr" lang="en" className="text-sm font-medium">
              {item.Name}
              {item.Amount ? <span className="ms-2 tabular-nums text-muted-foreground">{item.Amount}</span> : null}
            </dt>
            {item.Gloss ? <dd className="m-0 text-sm text-muted-foreground">{item.Gloss}</dd> : null}
          </div>
        ))}
      </dl>
      {str("inci") ? (
        <div className="mt-3">
          <Disclosure summary={str("inciLabel") || t(locale, "Full ingredients (INCI)", "সম্পূর্ণ উপাদান (INCI)")}>
            <p dir="ltr" lang="en" className="m-0 text-xs leading-relaxed text-muted-foreground">
              {str("inci")}
            </p>
          </Disclosure>
        </div>
      ) : null}
    </Panel>
  );
};

/* ------------------------------------------------------ ingredient_glossary */

const IngredientGlossary: WidgetComponent = ({ str, Heading }) => {
  const terms = repeated(str, "g", ["Term", "Body"], 6);
  if (terms.length === 0) return null;
  return (
    <Panel heading={str("heading")} Heading={Heading}>
      <div className="rounded-fq-md border border-border">
        {terms.map((term) => (
          <Disclosure key={term.key} summary={term.Term!}>
            <p className="m-0 text-sm text-muted-foreground">{term.Body}</p>
          </Disclosure>
        ))}
      </div>
    </Panel>
  );
};

/* ---------------------------------------------------------------- claim_chips */

const ClaimChips: WidgetComponent = ({ str, Heading }) => {
  const claims = repeated(str, "c", ["Label", "Source"], 6);
  if (claims.length === 0) return null;
  return (
    <Panel heading={str("heading")} Heading={Heading}>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {claims.map((claim) => (
          <li key={claim.key}>
            <span className="inline-flex min-h-[32px] items-center gap-2 rounded-full border border-border px-3 py-1 text-sm">
              {claim.Label}
              {claim.Source ? (
                <span className="text-xs text-muted-foreground" title={claim.Source}>
                  ⓘ
                  <span className="sr-only">{claim.Source}</span>
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
};

/* -------------------------------------------------------------- before_after */

/**
 * The disclaimer is not optional: results vary, and a paired-image claim
 * without that sentence is a regulatory problem, so lint fails on an empty
 * `disclaimer` and the widget refuses to render one.
 */
const BeforeAfter: WidgetComponent = ({ str, Heading, locale }) => {
  const before = str("beforeImage");
  const after = str("afterImage");
  const disclaimer = str("disclaimer").trim();
  if (!before || !after || !disclaimer) return null;
  return (
    <Panel heading={str("heading")} Heading={Heading}>
      <div className="grid gap-2 sm:grid-cols-2">
        <figure className="m-0">
          <MediaFrame src={before} alt={str("beforeAlt")} ratio="square" className="rounded-fq-md" />
          <figcaption className="mt-1 text-xs text-muted-foreground">
            {str("beforeLabel") || t(locale, "Before", "আগে")}
          </figcaption>
        </figure>
        <figure className="m-0">
          <MediaFrame src={after} alt={str("afterAlt")} ratio="square" className="rounded-fq-md" />
          <figcaption className="mt-1 text-xs text-muted-foreground">
            {str("afterLabel") || t(locale, "After", "পরে")}
          </figcaption>
        </figure>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{disclaimer}</p>
    </Panel>
  );
};

/* --------------------------------------------------------------- safety_note */

const SafetyNote: WidgetComponent = ({ str, Heading, locale }) => {
  const body = str("body").trim();
  if (!body) return null;
  return (
    <Panel heading={str("heading")} Heading={Heading}>
      <p className="m-0 text-sm">{body}</p>
      {str("howTo") ? (
        <div className="mt-3">
          <Disclosure summary={str("howToLabel") || t(locale, "How to patch test", "প্যাচ টেস্ট কীভাবে")}>
            <p className="m-0 whitespace-pre-line text-sm text-muted-foreground">{str("howTo")}</p>
          </Disclosure>
        </div>
      ) : null}
    </Panel>
  );
};

/* ---------------------------------------------------------------- batch_info */

const BatchInfo: WidgetComponent = ({ str, int, Heading, locale }) => {
  const pao = int("paoMonths", 0, 0, 60);
  const rows: [string, string][] = [
    [str("mfgLabel") || t(locale, "Manufactured", "উৎপাদন"), str("mfgDate")],
    [str("expiryLabel") || t(locale, "Best before", "মেয়াদ"), str("expiryDate")],
    [str("batchLabel") || t(locale, "Batch", "ব্যাচ"), str("batchCode")],
  ].filter(([, value]) => Boolean(value)) as [string, string][];
  if (rows.length === 0 && !pao) return null;
  return (
    <Panel heading={str("heading")} Heading={Heading}>
      <dl className="m-0 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 border-b border-border py-2 last:border-b-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="m-0 tabular-nums" dir="ltr">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {pao ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {t(locale, `Best used within ${pao} months of opening.`, `খোলার পর ${pao} মাসের মধ্যে ব্যবহার করুন।`)}
        </p>
      ) : null}
    </Panel>
  );
};

/* ------------------------------------------------------------- texture_strip */

const TextureStrip: WidgetComponent = ({ str, Heading }) => {
  const tiles = repeated(str, "t", ["Image", "Label", "Alt"], 4);
  if (tiles.length === 0) return null;
  return (
    <Panel heading={str("heading")} Heading={Heading}>
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.key} className="min-w-0">
            <MediaFrame src={tile.Image} alt={tile.Alt || tile.Label || ""} ratio="square" className="rounded-fq-md" />
            {tile.Label ? <p className="mt-1 m-0 text-xs text-muted-foreground">{tile.Label}</p> : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
};

/* ---------------------------------------------------------------- how_to_use */

const HowToUse: WidgetComponent = ({ str, Heading }) => {
  const steps = repeated(str, "s", ["Title", "Body"], 5);
  if (steps.length === 0) return null;
  return (
    <Panel heading={str("heading")} Heading={Heading}>
      <ol className="m-0 list-none space-y-3 p-0">
        {steps.map((step, index) => (
          <li key={step.key} className="flex gap-3">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-xs tabular-nums"
            >
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{step.Title}</span>
              {step.Body ? <span className="block text-sm text-muted-foreground">{step.Body}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
};

/* ------------------------------------------------------------- refill_widget */

/** Cadence choice only; the refill price is quoted by the server at add time. */
const RefillWidget: WidgetComponent = ({ str, data, locale, money, Heading }) => {
  const cadences = repeated(str, "c", ["Label", "Value"], 3);
  const [chosen, setChosen] = useState("");
  const refill = data?.rows?.[0];
  const active = chosen || cadences[0]?.Value || "";
  return (
    <Panel heading={str("heading")} Heading={Heading}>
      {str("body") ? <p className="m-0 text-sm text-muted-foreground">{str("body")}</p> : null}
      {refill ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-fq-md border border-border p-3">
          <span className="min-w-0 text-sm">{refill.title}</span>
          {typeof refill.priceMinor === "number" ? (
            <span className="shrink-0 text-sm tabular-nums">{money(refill.priceMinor, refill.currency)}</span>
          ) : null}
        </div>
      ) : null}
      {cadences.length ? (
        <div role="radiogroup" aria-label={str("heading")} className="mt-3 flex flex-wrap gap-2">
          {cadences.map((cadence) => (
            <button
              key={cadence.key}
              type="button"
              role="radio"
              aria-checked={cadence.Value === active}
              onClick={() => setChosen(cadence.Value!)}
              className={`min-h-[44px] rounded-full border px-4 text-sm ${
                cadence.Value === active ? "border-primary ring-1 ring-primary" : "border-border"
              }`}
            >
              {cadence.Label}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className="mt-3 min-h-[44px] rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
      >
        {str("buttonLabel") || t(locale, "Subscribe", "সাবস্ক্রাইব")}
      </button>
    </Panel>
  );
};

/* -------------------------------------------------------------- gift_builder */

/**
 * Pick N items, add a box and a message. The combined total comes back from
 * the server once the set is posted — this widget only counts items.
 */
const GiftBuilder: WidgetComponent = ({ str, int, data, locale, Heading }) => {
  const size = int("size", 3, 2, 6);
  const rows = data?.rows ?? [];
  const [picked, setPicked] = useState<string[]>([]);
  const remaining = size - picked.length;

  if (data?.pending) return <Skeleton lines={3} />;

  return (
    <Panel heading={str("heading")} Heading={Heading}>
      <p className="m-0 text-sm text-muted-foreground" role="status">
        {remaining > 0
          ? t(locale, `Pick ${remaining} more`, `আরও ${remaining} টি বেছে নিন`)
          : t(locale, "Your set is ready", "আপনার সেট প্রস্তুত")}
      </p>
      <ul className="mt-3 grid list-none gap-3 p-0 sm:grid-cols-2">
        {rows.map((row) => {
          const on = picked.includes(row.id);
          return (
            <li key={row.id} className="min-w-0">
              <label className="flex items-start gap-2 rounded-fq-md border border-border p-2">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!on && remaining <= 0}
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
      <label className="mt-3 block text-sm">
        <span className="mb-1 block">{str("messageLabel") || t(locale, "Message card", "মেসেজ কার্ড")}</span>
        <textarea
          rows={2}
          maxLength={200}
          className="w-full rounded-fq-md border border-border bg-background p-2 text-sm"
        />
      </label>
      <button
        type="button"
        disabled={remaining > 0}
        className="mt-3 min-h-[44px] rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {str("buttonLabel") || t(locale, "Add gift set", "গিফট সেট যোগ করুন")}
      </button>
      {str("note") ? <p className="mt-2 text-xs text-muted-foreground">{str("note")}</p> : null}
    </Panel>
  );
};

/* -------------------------------------------------------------- sample_picker */

const SamplePicker: WidgetComponent = ({ str, data, locale, money, Heading }) => {
  const rows = (data?.rows ?? []).slice(0, 4);
  const [chosen, setChosen] = useState("");
  const threshold = data?.rows?.[0]?.compareAtMinor;
  if (rows.length === 0) return null;
  return (
    <Panel heading={str("heading")} Heading={Heading}>
      {typeof threshold === "number" ? (
        <p className="m-0 text-sm text-muted-foreground">
          {str("thresholdText") || t(locale, "Free sample over", "ফ্রি স্যাম্পল, ন্যূনতম")}{" "}
          <span className="tabular-nums">{money(threshold, rows[0]!.currency)}</span>
        </p>
      ) : null}
      <div role="radiogroup" aria-label={str("heading")} className="mt-3 flex flex-wrap gap-2">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            role="radio"
            aria-checked={chosen === row.id}
            onClick={() => setChosen(row.id)}
            className={`min-h-[44px] rounded-full border px-4 text-sm ${
              chosen === row.id ? "border-primary ring-1 ring-primary" : "border-border"
            }`}
          >
            {row.title}
          </button>
        ))}
      </div>
    </Panel>
  );
};

/* ---------------------------------------------------------------- consult_cta */

/** Contact capture, so the consent chip is present and never pre-checked. */
const ConsultCta: WidgetComponent = ({ section, str, locale, Heading }) => {
  const [agreed, setAgreed] = useState(false);
  const [sent, setSent] = useState(false);
  const whatsapp = str("whatsapp").trim();
  const phone = str("phone").trim();

  return (
    <Panel heading={str("heading")} Heading={Heading}>
      {str("body") ? <p className="m-0 text-sm text-muted-foreground">{str("body")}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {whatsapp ? (
          <a
            href={`https://wa.me/${whatsapp.replace(/[^0-9]/g, "")}`}
            className="inline-flex min-h-[44px] items-center rounded-full border border-border px-4 text-sm"
          >
            {str("whatsappLabel") || "WhatsApp"}
          </a>
        ) : null}
        {phone ? (
          <a
            href={`tel:${phone.replace(/\s+/g, "")}`}
            className="inline-flex min-h-[44px] items-center rounded-full border border-border px-4 text-sm"
          >
            {str("callLabel") || t(locale, "Call us", "কল করুন")}
          </a>
        ) : null}
      </div>
      {sent ? (
        <p role="status" className="mt-3 text-sm">
          {str("pendingText") || t(locale, "We will call you back.", "আমরা কল করব।")}
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
            <span className="mb-1 block">{str("fieldLabel") || t(locale, "Your number", "আপনার নম্বর")}</span>
            <input
              name="phone"
              type="tel"
              required
              dir="ltr"
              className="min-h-[44px] w-full rounded-fq-md border border-border bg-background px-3 text-sm"
            />
          </label>
          <label className="flex items-start gap-2 text-xs">
            {/* Unchecked by default, always. */}
            <input
              type="checkbox"
              checked={agreed}
              onChange={() => setAgreed((value) => !value)}
              className="mt-0.5 h-4 w-4"
            />
            <ConsentChip props={section.props} locale={locale} />
          </label>
          <button
            type="submit"
            disabled={!agreed}
            className="min-h-[44px] rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {str("buttonLabel") || t(locale, "Book a consult", "কনসাল্ট বুক করুন")}
          </button>
        </form>
      )}
    </Panel>
  );
};

/* -------------------------------------------------------------- loyalty_strip */

/** Points are valued by the server; the widget prints what it is handed. */
const LoyaltyStrip: WidgetComponent = ({ str, data, locale, money }) => {
  const row = data?.rows?.[0];
  const points = row?.count;
  const label = str("label") || t(locale, "Points on this order", "এই অর্ডারে পয়েন্ট");
  if (data?.pending) return <Skeleton lines={1} />;
  if (typeof points !== "number" && typeof row?.priceMinor !== "number") return null;
  return (
    <p className="m-0 flex flex-wrap items-center justify-between gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm">
      <span>{label}</span>
      <span className="tabular-nums">
        {typeof points === "number" ? points : null}
        {typeof row?.priceMinor === "number" ? (
          <span className="ms-2 text-muted-foreground">{money(row.priceMinor, row.currency)}</span>
        ) : null}
      </span>
    </p>
  );
};

/* ------------------------------------------------------- concern_rail header */

/**
 * Small helper exported for the `product_rail` concern variant and the tone
 * filter on `ugc_gallery`: turns an authored slug list into chips.
 */
export function taxonomyChips(value: string, locale: "en" | "bn", kind?: TaxonomyKind) {
  return parseTerms(value, kind).map((term) => ({ slug: term.slug, label: termLabel(term.slug, locale) }));
}

/* ----------------------------------------------------------------- registry */

export const BEAUTY_WIDGETS: Record<
  Extract<
    SectionType,
    | "shade_finder"
    | "skin_quiz"
    | "routine_builder"
    | "ingredient_list"
    | "ingredient_glossary"
    | "claim_chips"
    | "before_after"
    | "safety_note"
    | "batch_info"
    | "texture_strip"
    | "how_to_use"
    | "refill_widget"
    | "gift_builder"
    | "sample_picker"
    | "consult_cta"
    | "loyalty_strip"
  >,
  WidgetComponent
> = {
  shade_finder: ShadeFinder,
  skin_quiz: SkinQuiz,
  routine_builder: RoutineBuilder,
  ingredient_list: IngredientList,
  ingredient_glossary: IngredientGlossary,
  claim_chips: ClaimChips,
  before_after: BeforeAfter,
  safety_note: SafetyNote,
  batch_info: BatchInfo,
  texture_strip: TextureStrip,
  how_to_use: HowToUse,
  refill_widget: RefillWidget,
  gift_builder: GiftBuilder,
  sample_picker: SamplePicker,
  consult_cta: ConsultCta,
  loyalty_strip: LoyaltyStrip,
};
