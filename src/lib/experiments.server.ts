/**
 * Server-side A/B experiments — Section A line.
 *
 * Assignment is decided by the database and persisted, so:
 * - the same subject always resolves to the same variant (no flicker, no
 *   re-randomisation when weights are edited mid-flight);
 * - the client cannot pick its own variant or claim a conversion for one it
 *   never received — conversions attach to the stored assignment;
 * - a missing, paused or misconfigured experiment resolves to the control path
 *   rather than throwing, so an experiment can never take a storefront down.
 */
import { publicClient } from "./pricing.server";
import { incr, log, withSpan } from "./observability.server";

type Rpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export type Assignment = {
  variant: string | null;
  variant_id?: string;
  is_control?: boolean;
  payload?: Record<string, unknown>;
  experiment_id?: string;
  reason: "assigned" | "holdout" | "not_running" | "no_variant" | "unavailable";
};

export const CONTROL: Assignment = { variant: null, reason: "not_running" };

/**
 * Resolve the variant for one subject. Never throws: on any failure the caller
 * gets the control path and the failure is counted.
 */
export async function assignVariant(
  merchantId: string,
  key: string,
  subjectKey: string,
): Promise<Assignment> {
  return withSpan("experiment.assign", async () => {
    try {
      const db = publicClient() as unknown as Rpc;
      const { data, error } = await db.rpc("experiment_assign", {
        _merchant_id: merchantId,
        _key: key,
        _subject_key: subjectKey,
      });
      if (error) throw error;
      const result = (data as Assignment | null) ?? CONTROL;
      incr("framique_experiment_assign_total", {
        experiment: key,
        outcome: result.reason,
      });
      return result;
    } catch {
      incr("framique_experiment_assign_total", { experiment: key, outcome: "unavailable" });
      log("warn", "experiment.assign_failed", { key });
      return { variant: null, reason: "unavailable" };
    }
  });
}

/**
 * Record a conversion against whatever variant the subject already holds.
 * Value is minor units (integer), consistent with the money rules.
 */
export async function recordConversion(
  merchantId: string,
  key: string,
  subjectKey: string,
  metric: string,
  valueMinor = 0,
): Promise<boolean> {
  try {
    const db = publicClient() as unknown as Rpc;
    const { data, error } = await db.rpc("experiment_convert", {
      _merchant_id: merchantId,
      _key: key,
      _subject_key: subjectKey,
      _metric: metric,
      _value_minor: Math.max(0, Math.trunc(valueMinor)),
    });
    if (error) throw error;
    incr("framique_experiment_conversion_total", { experiment: key, metric });
    return Boolean(data);
  } catch {
    incr("framique_experiment_conversion_total", { experiment: key, metric: "failed" });
    log("warn", "experiment.convert_failed", { key });
    return false;
  }
}

/* --------------------------------- admin ---------------------------------- */

type Client = {
  from: (table: string) => any;
};

export type ExperimentRow = {
  id: string;
  key: string;
  name: string;
  hypothesis: string;
  surface: string;
  status: string;
  traffic_pct: number;
  started_at: string | null;
  stopped_at: string | null;
  variants: {
    id: string;
    key: string;
    is_control: boolean;
    weight_pct: number;
    exposures: number;
    conversions: number;
    revenue_minor: number;
  }[];
};

/** Experiment list with exposure and conversion roll-ups for the admin table. */
export async function listExperiments(db: Client, merchantId: string): Promise<ExperimentRow[]> {
  const [{ data: experiments, error }, { data: variants }, { data: exposures }] = await Promise.all([
    db
      .from("experiments")
      .select("id, key, name, hypothesis, surface, status, traffic_pct, started_at, stopped_at")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("experiment_variants")
      .select("id, experiment_id, key, is_control, weight_pct")
      .eq("merchant_id", merchantId),
    db
      .from("experiment_exposures")
      .select("experiment_id, variant_id, metric, hits, value_minor_int")
      .eq("merchant_id", merchantId),
  ]);
  if (error) throw error;

  const totals = new Map<string, { exposures: number; conversions: number; revenue: number }>();
  for (const e of (exposures ?? []) as {
    variant_id: string;
    metric: string;
    hits: number;
    value_minor_int: number;
  }[]) {
    const cur = totals.get(e.variant_id) ?? { exposures: 0, conversions: 0, revenue: 0 };
    if (e.metric === "exposure") cur.exposures += Number(e.hits ?? 0);
    else {
      cur.conversions += Number(e.hits ?? 0);
      cur.revenue += Number(e.value_minor_int ?? 0);
    }
    totals.set(e.variant_id, cur);
  }

  return ((experiments ?? []) as ExperimentRow[]).map((x) => ({
    ...x,
    variants: ((variants ?? []) as { experiment_id: string; id: string }[])
      .filter((v) => v.experiment_id === x.id)
      .map((v) => {
        const t = totals.get(v.id) ?? { exposures: 0, conversions: 0, revenue: 0 };
        return {
          ...(v as unknown as ExperimentRow["variants"][number]),
          exposures: t.exposures,
          conversions: t.conversions,
          revenue_minor: t.revenue,
        };
      })
      .sort((a, b) => (a.is_control === b.is_control ? a.key.localeCompare(b.key) : a.is_control ? -1 : 1)),
  }));
}

export type ExperimentInput = {
  id: string | null;
  key: string;
  name: string;
  hypothesis: string;
  surface: string;
  trafficPct: number;
  variants: { key: string; isControl: boolean; weightPct: number }[];
};

/**
 * Create or replace an experiment and its variants. Weights are validated here
 * and again by a deferred database constraint, so a running experiment can
 * never serve traffic that does not add up to 100%.
 */
export async function saveExperiment(db: Client, merchantId: string, input: ExperimentInput) {
  const total = input.variants.reduce((sum, v) => sum + v.weightPct, 0);
  if (input.variants.length < 2) throw new Error("experiment.needs_two_variants");
  if (total !== 100) throw new Error("experiment.weights_must_total_100");
  if (input.variants.filter((v) => v.isControl).length !== 1) {
    throw new Error("experiment.needs_exactly_one_control");
  }

  const row = {
    merchant_id: merchantId,
    key: input.key,
    name: input.name,
    hypothesis: input.hypothesis,
    surface: input.surface,
    traffic_pct: input.trafficPct,
  };

  let experimentId = input.id;
  if (experimentId) {
    const { error } = await db
      .from("experiments")
      .update(row)
      .eq("id", experimentId)
      .eq("merchant_id", merchantId);
    if (error) throw error;
  } else {
    const { data, error } = await db.from("experiments").insert(row).select("id").single();
    if (error) throw error;
    experimentId = (data as { id: string }).id;
  }

  // Replace the variant set wholesale; assignments cascade off variant rows, so
  // this is only safe while the experiment is not yet running.
  const { error: delError } = await db
    .from("experiment_variants")
    .delete()
    .eq("experiment_id", experimentId)
    .eq("merchant_id", merchantId);
  if (delError) throw delError;

  const { error: insError } = await db.from("experiment_variants").insert(
    input.variants.map((v) => ({
      merchant_id: merchantId,
      experiment_id: experimentId,
      key: v.key,
      is_control: v.isControl,
      weight_pct: v.weightPct,
    })),
  );
  if (insError) throw insError;

  return experimentId as string;
}

/**
 * Lifecycle transition. Stopping is terminal and keeps the collected data;
 * a stopped experiment is never restarted, so results cannot be mixed across
 * two different variant configurations.
 */
export async function setExperimentStatus(
  db: Client,
  merchantId: string,
  experimentId: string,
  status: "draft" | "running" | "paused" | "stopped",
) {
  const { data: current, error: readError } = await db
    .from("experiments")
    .select("status")
    .eq("id", experimentId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) throw new Error("experiment.not_found");
  if ((current as { status: string }).status === "stopped") {
    throw new Error("experiment.already_stopped");
  }

  const patch: Record<string, unknown> = { status };
  if (status === "running") patch['started_at'] = new Date().toISOString();
  if (status === "stopped") patch['stopped_at'] = new Date().toISOString();

  const { error } = await db
    .from("experiments")
    .update(patch)
    .eq("id", experimentId)
    .eq("merchant_id", merchantId);
  if (error) throw error;
}
