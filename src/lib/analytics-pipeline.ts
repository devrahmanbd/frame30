/**
 * Pure analytics maths — §3.4.
 *
 * Nothing here touches the network or the database, so every rule (funnel
 * drop-off, cohort retention, persona banding, inventory aging, report
 * validation) is unit-testable and identical on server and client. The server
 * modules import these helpers; the UI imports the same ones for labels so a
 * chart and its export can never disagree.
 */

export const FUNNEL_STAGES = [
  { key: "visit", entity: "page", action: "view", en: "Visitors", bn: "ভিজিটর" },
  { key: "product", entity: "product", action: "view", en: "Product views", bn: "প্রোডাক্ট ভিউ" },
  { key: "cart", entity: "cart", action: "add", en: "Added to cart", bn: "কার্টে যোগ" },
  { key: "checkout", entity: "checkout", action: "start", en: "Checkout started", bn: "চেকআউট শুরু" },
  { key: "paid", entity: "order", action: "paid", en: "Paid", bn: "পেমেন্ট সম্পন্ন" },
] as const;

export type FunnelStageKey = (typeof FUNNEL_STAGES)[number]["key"];

export type DailyBucket = {
  entity: string;
  day: string;
  totals: {
    events?: number;
    visitors?: number;
    sessions?: number;
    value_minor_int?: number;
    actions?: Record<string, number>;
  } | null;
};

export type FunnelStage = {
  key: FunnelStageKey;
  en: string;
  bn: string;
  count: number;
  /** Share of the very first stage, 0-100 with one decimal. */
  ofTop: number;
  /** Share of the immediately preceding stage, 0-100 with one decimal. */
  ofPrevious: number;
  /** People lost between the previous stage and this one. */
  dropOff: number;
};

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function pct(part: number, whole: number) {
  if (whole <= 0) return 0;
  return round1((part / whole) * 100);
}

/** Folds daily rollup buckets into an ordered funnel with honest drop-off. */
export function buildFunnel(buckets: DailyBucket[]): {
  stages: FunnelStage[];
  conversionRate: number;
  biggestLeak: FunnelStageKey | null;
} {
  const counts = new Map<FunnelStageKey, number>();
  for (const stage of FUNNEL_STAGES) counts.set(stage.key, 0);

  for (const bucket of buckets) {
    const actions = bucket.totals?.actions ?? {};
    for (const stage of FUNNEL_STAGES) {
      if (bucket.entity !== stage.entity) continue;
      const hits = Number(actions[stage.action] ?? 0);
      if (!Number.isFinite(hits) || hits <= 0) continue;
      counts.set(stage.key, (counts.get(stage.key) ?? 0) + hits);
    }
  }

  const top = counts.get(FUNNEL_STAGES[0].key) ?? 0;
  let previous = top;
  let biggestLeak: FunnelStageKey | null = null;
  let worst = -1;

  const stages = FUNNEL_STAGES.map((stage, index) => {
    const count = counts.get(stage.key) ?? 0;
    const dropOff = index === 0 ? 0 : Math.max(0, previous - count);
    const row: FunnelStage = {
      key: stage.key,
      en: stage.en,
      bn: stage.bn,
      count,
      ofTop: pct(count, top),
      ofPrevious: index === 0 ? 100 : pct(count, previous),
      dropOff,
    };
    if (index > 0 && dropOff > worst) {
      worst = dropOff;
      biggestLeak = stage.key;
    }
    previous = count;
    return row;
  });

  return {
    stages,
    conversionRate: pct(counts.get("paid") ?? 0, top),
    biggestLeak: worst > 0 ? biggestLeak : null,
  };
}

export type CohortRow = {
  cohort_week: string;
  week_offset: number;
  customers: number;
  active_customers: number;
  orders: number;
  revenue_minor_int: number;
};

export type CohortMatrix = {
  weeks: string[];
  maxOffset: number;
  rows: {
    week: string;
    size: number;
    cells: { offset: number; active: number; retention: number; revenueMinorInt: number }[];
  }[];
  /** Average retention per offset across cohorts, offset 0 excluded. */
  averages: { offset: number; retention: number }[];
};

/** Turns flat cohort rows into a dense retention grid the UI can render. */
export function buildCohortMatrix(rows: CohortRow[], maxOffsetCap = 8): CohortMatrix {
  const byWeek = new Map<string, CohortRow[]>();
  for (const row of rows) {
    if (row.week_offset < 0 || row.week_offset > maxOffsetCap) continue;
    const list = byWeek.get(row.cohort_week) ?? [];
    list.push(row);
    byWeek.set(row.cohort_week, list);
  }

  const weeks = [...byWeek.keys()].sort();
  const maxOffset = Math.min(
    maxOffsetCap,
    rows.reduce((max, r) => Math.max(max, r.week_offset), 0),
  );

  const grid = weeks.map((week) => {
    const list = byWeek.get(week) ?? [];
    const size = list.reduce((max, r) => Math.max(max, r.customers), 0);
    const cells: CohortMatrix["rows"][number]["cells"] = [];
    for (let offset = 0; offset <= maxOffset; offset += 1) {
      const hit = list.find((r) => r.week_offset === offset);
      cells.push({
        offset,
        active: hit?.active_customers ?? 0,
        retention: pct(hit?.active_customers ?? 0, size),
        revenueMinorInt: hit?.revenue_minor_int ?? 0,
      });
    }
    return { week, size, cells };
  });

  const averages: { offset: number; retention: number }[] = [];
  for (let offset = 1; offset <= maxOffset; offset += 1) {
    const values = grid
      .map((r) => r.cells[offset]?.retention ?? 0)
      .filter((_, i) => (grid[i]?.size ?? 0) > 0);
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    averages.push({ offset, retention: round1(avg) });
  }

  return { weeks, maxOffset, rows: grid, averages };
}

export const PERSONAS = ["new", "repeat", "loyal", "vip", "at_risk", "dormant"] as const;
export type Persona = (typeof PERSONAS)[number];

export const PERSONA_LABELS: Record<Persona, { en: string; bn: string; hint: string }> = {
  new: { en: "First-time", bn: "নতুন", hint: "One order, bought recently" },
  repeat: { en: "Repeat", bn: "রিপিট", hint: "2-3 orders and still active" },
  loyal: { en: "Loyal", bn: "লয়্যাল", hint: "4+ orders and still active" },
  vip: { en: "VIP", bn: "ভিআইপি", hint: "Top spenders — high lifetime value" },
  at_risk: { en: "At risk", bn: "ঝুঁকিতে", hint: "Was active, quiet for 60-120 days" },
  dormant: { en: "Dormant", bn: "নিষ্ক্রিয়", hint: "No order in 120+ days" },
};

export type BuyerStats = {
  orders: number;
  spendMinorInt: number;
  daysSinceLast: number;
};

/**
 * Deterministic persona banding. VIP wins over everything (spend is the
 * strongest signal), then recency decay, then frequency.
 */
export function classifyPersona(stats: BuyerStats, vipSpendMinorInt: number): Persona {
  if (stats.orders <= 0) return "dormant";
  if (vipSpendMinorInt > 0 && stats.spendMinorInt >= vipSpendMinorInt && stats.daysSinceLast <= 120) {
    return "vip";
  }
  if (stats.daysSinceLast > 120) return "dormant";
  if (stats.daysSinceLast > 60) return "at_risk";
  if (stats.orders >= 4) return "loyal";
  if (stats.orders >= 2) return "repeat";
  return "new";
}

/** 90th-percentile spend defines VIP so the band adapts to each store. */
export function vipThreshold(spends: number[]): number {
  const sorted = [...spends].filter((n) => n > 0).sort((a, b) => a - b);
  if (sorted.length < 5) return 0;
  const idx = Math.floor(sorted.length * 0.9);
  return sorted[Math.min(idx, sorted.length - 1)] ?? 0;
}

export const AGING_BUCKETS = [
  { key: "fresh", en: "0-30 days", maxDays: 30 },
  { key: "slow", en: "31-60 days", maxDays: 60 },
  { key: "stale", en: "61-90 days", maxDays: 90 },
  { key: "dead", en: "90+ days", maxDays: Number.POSITIVE_INFINITY },
] as const;

export type AgingKey = (typeof AGING_BUCKETS)[number]["key"];

export function agingBucket(daysSinceLastSale: number): AgingKey {
  for (const bucket of AGING_BUCKETS) {
    if (daysSinceLastSale <= bucket.maxDays) return bucket.key;
  }
  return "dead";
}

export type AgingInput = {
  variantId: string;
  title: string;
  sku: string | null;
  stock: number;
  unitCostMinorInt: number;
  daysSinceLastSale: number;
};

export function summarizeAging(rows: AgingInput[]) {
  const buckets = AGING_BUCKETS.map((b) => ({
    key: b.key,
    label: b.en,
    units: 0,
    variants: 0,
    tiedUpMinorInt: 0,
  }));
  const index = new Map(buckets.map((b, i) => [b.key, i] as const));

  for (const row of rows) {
    const i = index.get(agingBucket(row.daysSinceLastSale));
    if (i === undefined) continue;
    const bucket = buckets[i]!;
    bucket.units += Math.max(0, row.stock);
    bucket.variants += 1;
    bucket.tiedUpMinorInt += Math.max(0, row.stock) * Math.max(0, row.unitCostMinorInt);
  }

  return {
    buckets,
    totalTiedUpMinorInt: buckets.reduce((sum, b) => sum + b.tiedUpMinorInt, 0),
    deadStockMinorInt: buckets.find((b) => b.key === "dead")?.tiedUpMinorInt ?? 0,
  };
}

// ------------------------------------------------------------------ reports

export const REPORT_DATASETS = {
  orders: {
    en: "Orders",
    dimensions: ["day", "status", "payment_method", "channel"],
    metrics: ["orders", "revenue_minor_int", "aov_minor_int", "discount_minor_int"],
  },
  products: {
    en: "Product performance",
    dimensions: ["product_title", "day"],
    metrics: ["units", "revenue_minor_int", "orders"],
  },
  customers: {
    en: "Customers & personas",
    dimensions: ["persona", "cohort_week"],
    metrics: ["customers", "orders", "revenue_minor_int"],
  },
  traffic: {
    en: "Traffic & funnel",
    dimensions: ["day", "entity", "source", "campaign"],
    metrics: ["events", "visitors", "sessions"],
  },
} as const;

export type DatasetKey = keyof typeof REPORT_DATASETS;

export type ReportDefinition = {
  dataset: string;
  dimensions: string[];
  metrics: string[];
  rangeDays: number;
  schedule: string;
  format: string;
  recipients: string[];
};

export const SCHEDULES = ["off", "daily", "weekly", "monthly"] as const;
export const FORMATS = ["csv", "json"] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Rejects a report before it can be scheduled: unknown columns, empty metric
 * lists and bad recipients would otherwise fail silently at 3am in a cron run.
 */
export function validateReport(input: ReportDefinition): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const dataset = REPORT_DATASETS[input.dataset as DatasetKey];

  if (!dataset) {
    return { ok: false, errors: [`Unknown dataset "${input.dataset}"`] };
  }
  if (input.metrics.length === 0) errors.push("Pick at least one metric");
  if (input.metrics.length > 6) errors.push("At most 6 metrics per report");
  if (input.dimensions.length > 3) errors.push("At most 3 dimensions per report");

  for (const dim of input.dimensions) {
    if (!(dataset.dimensions as readonly string[]).includes(dim)) {
      errors.push(`"${dim}" is not a dimension of ${dataset.en}`);
    }
  }
  for (const metric of input.metrics) {
    if (!(dataset.metrics as readonly string[]).includes(metric)) {
      errors.push(`"${metric}" is not a metric of ${dataset.en}`);
    }
  }
  if (!Number.isInteger(input.rangeDays) || input.rangeDays < 1 || input.rangeDays > 365) {
    errors.push("Range must be between 1 and 365 days");
  }
  if (!(SCHEDULES as readonly string[]).includes(input.schedule)) errors.push("Unknown schedule");
  if (!(FORMATS as readonly string[]).includes(input.format)) errors.push("Unknown format");
  if (input.recipients.length > 10) errors.push("At most 10 recipients");
  for (const to of input.recipients) {
    if (!EMAIL_RE.test(to)) errors.push(`"${to}" is not a valid email`);
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

/** Next run time for a schedule, anchored to the given "now". */
export function nextRunAt(schedule: string, from: Date): string | null {
  const map: Record<string, number> = { daily: 1, weekly: 7, monthly: 30 };
  const days = map[schedule];
  if (!days) return null;
  const next = new Date(from);
  next.setUTCDate(next.getUTCDate() + days);
  next.setUTCHours(2, 0, 0, 0);
  return next.toISOString();
}

/** CSV with RFC-4180 quoting so a product title with a comma cannot shift columns. */
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const head = columns.map(escape).join(",");
  const body = rows.map((row) => columns.map((c) => escape(row[c])).join(",")).join("\n");
  return rows.length ? `${head}\n${body}` : head;
}

// ------------------------------------------------------- pipeline health

export type BatchRow = {
  id: string;
  previous_batch_id: string | null;
  status: string;
  committed_at: string | null;
  event_count: number;
  gap_detected: boolean;
  created_at: string;
};

/**
 * The ledger is a time chain: every batch must point at the batch before it.
 * A broken link means events may be missing, and we say so instead of quietly
 * renumbering.
 */
export function auditBatchChain(batches: BatchRow[]) {
  const ordered = [...batches].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const ids = new Set(ordered.map((b) => b.id));
  const problems: { batchId: string; reason: string }[] = [];

  ordered.forEach((batch, index) => {
    if (index > 0) {
      const expected = ordered[index - 1]!.id;
      if (batch.previous_batch_id !== expected) {
        problems.push({ batchId: batch.id, reason: "chain_break" });
      }
    }
    if (batch.previous_batch_id && !ids.has(batch.previous_batch_id)) {
      // Out of window rather than missing — only flag when it is also uncommitted.
      if (!batch.committed_at) problems.push({ batchId: batch.id, reason: "orphan" });
    }
    if (batch.status !== "committed" && !batch.committed_at) {
      problems.push({ batchId: batch.id, reason: "uncommitted" });
    }
  });

  const last = ordered[ordered.length - 1];
  return {
    healthy: problems.length === 0,
    problems,
    lastCommittedAt: [...ordered].reverse().find((b) => b.committed_at)?.committed_at ?? null,
    lastBatchId: last?.id ?? null,
    totalEvents: ordered.reduce((sum, b) => sum + (b.event_count ?? 0), 0),
  };
}

/** Buffer flush window is a design constant — 5 minutes, never floated. */
export const FLUSH_WINDOW_SECONDS = 300;
export const RAW_WINDOW_DAYS = 90;

export function isStale(lastCommittedAt: string | null, now: Date): boolean {
  if (!lastCommittedAt) return true;
  const age = now.getTime() - new Date(lastCommittedAt).getTime();
  return age > FLUSH_WINDOW_SECONDS * 1000 * 3;
}
