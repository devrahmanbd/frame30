import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useMerchant } from "@/hooks/use-merchant";
import {
  experimentListFn,
  experimentSaveFn,
  experimentStatusFn,
} from "@/lib/conversion.functions";

export const Route = createFileRoute("/_authenticated/admin/experiments")({
  head: () => ({
    meta: [
      { title: "A/B experiments — Framique Admin" },
      {
        name: "description",
        content:
          "Run server-side A/B experiments with stable variant assignment, live exposure counts and conversion rates.",
      },
      { property: "og:title", content: "Server-side A/B experiments" },
      {
        property: "og:description",
        content: "Split storefront traffic deterministically and measure what actually converts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Experiments,
});

type Draft = {
  key: string;
  name: string;
  hypothesis: string;
  surface: string;
  trafficPct: number;
  variants: { key: string; isControl: boolean; weightPct: number }[];
};

const EMPTY_DRAFT: Draft = {
  key: "",
  name: "",
  hypothesis: "",
  surface: "storefront",
  trafficPct: 100,
  variants: [
    { key: "control", isControl: true, weightPct: 50 },
    { key: "variant_b", isControl: false, weightPct: 50 },
  ],
};

const rate = (conversions: number, exposures: number) =>
  exposures === 0 ? "—" : `${((conversions / exposures) * 100).toFixed(1)}%`;

function Experiments() {
  const qc = useQueryClient();
  const { data: merchant } = useMerchant();
  const list = useServerFn(experimentListFn);
  const save = useServerFn(experimentSaveFn);
  const setStatus = useServerFn(experimentStatusFn);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  const experiments = useQuery({
    queryKey: ["experiments", merchant?.id],
    enabled: !!merchant,
    refetchInterval: 60_000,
    queryFn: () => list({ data: { merchantId: merchant!.id } }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["experiments", merchant?.id] });
  };

  const create = useMutation({
    mutationFn: () => save({ data: { merchantId: merchant!.id, id: null, ...draft } }),
    onSuccess: () => {
      setDraft(EMPTY_DRAFT);
      invalidate();
      toast.success("Experiment created as a draft");
    },
    onError: (error: Error) => toast.error(readableError(error.message)),
  });

  const transition = useMutation({
    mutationFn: (vars: { experimentId: string; status: "running" | "paused" | "stopped" }) =>
      setStatus({ data: { merchantId: merchant!.id, ...vars } }),
    onSuccess: () => {
      invalidate();
      toast.success("Experiment updated");
    },
    onError: (error: Error) => toast.error(readableError(error.message)),
  });

  const totalWeight = draft.variants.reduce((sum, v) => sum + v.weightPct, 0);
  const controlCount = draft.variants.filter((v) => v.isControl).length;
  const draftValid =
    draft.key.length >= 2 && draft.name.length >= 2 && totalWeight === 100 && controlCount === 1;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header>
        <h1 className="text-xl font-semibold">A/B experiments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Variants are assigned on the server and stored, so a shopper sees the same version on
          every visit and conversions can only be attributed to the variant they actually received.
        </p>
      </header>

      <section className="mt-8 rounded-fq-md border border-border bg-card p-5" aria-labelledby="new-exp">
        <h2 id="new-exp" className="text-sm font-semibold">
          New experiment
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Key"
            hint="Used in code. Lowercase, no spaces."
            value={draft.key}
            onChange={(v) => setDraft({ ...draft, key: v.toLowerCase().replace(/[^a-z0-9_.-]/g, "") })}
          />
          <Field label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
          <Field
            label="Surface"
            hint="Where it runs, e.g. product, checkout."
            value={draft.surface}
            onChange={(v) => setDraft({ ...draft, surface: v })}
          />
          <div>
            <label className="text-xs font-medium" htmlFor="traffic">
              Traffic share ({draft.trafficPct}%)
            </label>
            <input
              id="traffic"
              type="range"
              min={0}
              max={100}
              step={5}
              value={draft.trafficPct}
              onChange={(e) => setDraft({ ...draft, trafficPct: Number(e.target.value) })}
              className="mt-3 w-full"
            />
            <p className="text-xs text-muted-foreground">
              The rest is held out and always sees the control path.
            </p>
          </div>
        </div>

        <label className="mt-4 block text-xs font-medium" htmlFor="hypothesis">
          Hypothesis
        </label>
        <textarea
          id="hypothesis"
          rows={2}
          value={draft.hypothesis}
          onChange={(e) => setDraft({ ...draft, hypothesis: e.target.value })}
          placeholder="We believe … will increase … because …"
          className="mt-1 w-full rounded-fq-md border border-border bg-background p-3 text-sm"
        />

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Variants
            </h3>
            <span
              className={`text-xs tabular-nums ${
                totalWeight === 100 ? "text-muted-foreground" : "text-danger-foreground"
              }`}
            >
              {totalWeight}% allocated
            </span>
          </div>
          <ul className="mt-2 space-y-2">
            {draft.variants.map((v, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <input
                  aria-label={`Variant ${i + 1} key`}
                  value={v.key}
                  onChange={(e) => {
                    const variants = [...draft.variants];
                    variants[i] = { ...v, key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") };
                    setDraft({ ...draft, variants });
                  }}
                  className="min-h-11 flex-1 rounded-fq-md border border-border bg-background px-3 text-sm"
                />
                <label className="flex min-h-11 items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="control"
                    checked={v.isControl}
                    onChange={() =>
                      setDraft({
                        ...draft,
                        variants: draft.variants.map((x, j) => ({ ...x, isControl: i === j })),
                      })
                    }
                  />
                  Control
                </label>
                <label className="flex min-h-11 items-center gap-2 text-xs">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    aria-label={`Variant ${i + 1} weight`}
                    value={v.weightPct}
                    onChange={(e) => {
                      const variants = [...draft.variants];
                      variants[i] = { ...v, weightPct: Number(e.target.value) };
                      setDraft({ ...draft, variants });
                    }}
                    className="min-h-11 w-20 rounded-fq-md border border-border bg-background px-2 text-sm"
                  />
                  %
                </label>
                {draft.variants.length > 2 && (
                  <button
                    type="button"
                    aria-label={`Remove variant ${v.key}`}
                    onClick={() =>
                      setDraft({ ...draft, variants: draft.variants.filter((_, j) => j !== i) })
                    }
                    className="min-h-11 min-w-11 text-muted-foreground hover:text-danger-foreground"
                  >
                    <Trash2 aria-hidden className="mx-auto size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {draft.variants.length < 6 && (
            <button
              type="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  variants: [
                    ...draft.variants,
                    { key: `variant_${draft.variants.length + 1}`, isControl: false, weightPct: 0 },
                  ],
                })
              }
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-fq-md border border-border px-4 text-sm"
            >
              <Plus aria-hidden className="size-4" /> Add variant
            </button>
          )}
        </div>

        <button
          type="button"
          disabled={!draftValid || create.isPending}
          onClick={() => create.mutate()}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-fq-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {create.isPending && <Loader2 aria-hidden className="size-4 animate-spin" />}
          Create draft
        </button>
        {!draftValid && (
          <p className="mt-2 text-xs text-muted-foreground">
            Needs a key, a name, exactly one control and weights totalling 100%.
          </p>
        )}
      </section>

      <section className="mt-10" aria-labelledby="live">
        <h2 id="live" className="text-sm font-semibold">
          Experiments
        </h2>

        {experiments.isLoading && (
          <div className="mt-4 h-32 animate-pulse rounded-fq-md bg-muted" aria-hidden />
        )}
        {experiments.isSuccess && experiments.data.length === 0 && (
          <p className="mt-4 rounded-fq-md border border-border bg-card p-6 text-sm text-muted-foreground">
            No experiments yet.
          </p>
        )}

        <ul className="mt-4 space-y-4">
          {(experiments.data ?? []).map((x) => (
            <li key={x.id} className="rounded-fq-md border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{x.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {x.key} · {x.surface} · {x.traffic_pct}% of traffic
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {x.status}
                  </span>
                  {x.status !== "stopped" && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          transition.mutate({
                            experimentId: x.id,
                            status: x.status === "running" ? "paused" : "running",
                          })
                        }
                        className="min-h-11 rounded-fq-md border border-border px-3 text-sm"
                      >
                        {x.status === "running" ? "Pause" : "Start"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("Stopping is permanent. Continue?")) {
                            transition.mutate({ experimentId: x.id, status: "stopped" });
                          }
                        }}
                        className="min-h-11 rounded-fq-md border border-border px-3 text-sm text-danger-foreground"
                      >
                        Stop
                      </button>
                    </>
                  )}
                </div>
              </div>

              {x.hypothesis && (
                <p className="mt-2 text-xs italic text-muted-foreground">{x.hypothesis}</p>
              )}

              <table className="mt-3 w-full text-sm">
                <caption className="sr-only">Variant performance for {x.name}</caption>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-1">Variant</th>
                    <th scope="col" className="py-1 text-right">Split</th>
                    <th scope="col" className="py-1 text-right">Exposures</th>
                    <th scope="col" className="py-1 text-right">Conversions</th>
                    <th scope="col" className="py-1 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {x.variants.map((v) => (
                    <tr key={v.id} className="border-t border-border">
                      <td className="py-1.5">
                        {v.key}
                        {v.is_control && (
                          <span className="ml-2 text-[11px] text-muted-foreground">control</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{v.weight_pct}%</td>
                      <td className="py-1.5 text-right tabular-nums">{v.exposures}</td>
                      <td className="py-1.5 text-right tabular-nums">{v.conversions}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {rate(v.conversions, v.exposures)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">
                Rates are descriptive only — do not call a winner on a handful of exposures.
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function readableError(message: string) {
  if (message.includes("weights_must_total_100")) return "Variant weights must total 100%.";
  if (message.includes("needs_exactly_one_control")) return "Mark exactly one variant as control.";
  if (message.includes("needs_two_variants")) return "An experiment needs at least two variants.";
  if (message.includes("already_stopped")) return "That experiment is already stopped.";
  if (/duplicate|unique/i.test(message)) return "That experiment key is already used.";
  return "Could not save the experiment.";
}

function Field({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = `field-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div>
      <label className="text-xs font-medium" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm"
      />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
