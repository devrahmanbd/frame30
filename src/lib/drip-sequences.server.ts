/**
 * Cold Mail & Marketing Drip Sequences Engine (Phase 10.5).
 *
 * Implements automated multi-step outreach and nurturing sequences with:
 *   1. Step delay scheduling (e.g. Day 0 Welcome -> Day 2 Value -> Day 5 Offer).
 *   2. Strict RFC 8058 List-Unsubscribe header generation.
 *   3. Opt-out ledger gating (consent_events check suppresses any opted-out recipient).
 *   4. Append-only delivery auditing via `campaign_sends`.
 *   5. Delivery via custom merchant SMTP or platform fallback.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { sendTenantMail } from "./smtp.server";
import { renderEmailHtml, interpolate } from "./transactional-mailer.server";
import { captureError, incr, log } from "./observability.server";

type Client = SupabaseClient<Database>;

export type DripStep = {
  id: string;
  stepNumber: number;
  delayDays: number;
  delayHours: number;
  subject: string;
  bodyTemplate: string;
  ctaText?: string;
  ctaUrl?: string;
};

export type DripSequence = {
  id: string;
  merchantId: string;
  name: string;
  description?: string;
  trigger: "new_subscriber" | "manual_enroll" | "cold_outreach";
  status: "active" | "paused" | "draft";
  steps: DripStep[];
  createdAt: string;
  updatedAt: string;
  stats: {
    enrolledCount: number;
    completedCount: number;
    sentCount: number;
  };
};

export type EnrolledContact = {
  id: string;
  email: string;
  name?: string;
  sequenceId: string;
  currentStep: number; // 0 = not sent step 1 yet
  lastStepSentAt?: string | null;
  enrolledAt: string;
  completedAt?: string | null;
  status: "active" | "completed" | "suppressed" | "paused";
};

type SequencesState = {
  sequences: Record<string, DripSequence>;
  enrollments: Record<string, EnrolledContact[]>; // sequenceId -> contacts
};

const DEFAULT_WELCOME_SEQUENCE: DripSequence = {
  id: "seq_default_welcome",
  merchantId: "",
  name: "New Subscriber Warm-up",
  description: "3-step welcome and introductory drip for new subscribers",
  trigger: "new_subscriber",
  status: "draft",
  steps: [
    {
      id: "step_1",
      stepNumber: 1,
      delayDays: 0,
      delayHours: 0,
      subject: "Welcome to {{store_name}} — Here is what to expect",
      bodyTemplate:
        "Hi {{customer_name}},\n\nThank you for joining our community! We are excited to have you with us.\n\nOver the coming days, we will share exclusive updates, customer stories, and early access to our newest arrivals.",
      ctaText: "Explore the Store",
      ctaUrl: "https://framique.qubickle.com/store/{{store_slug}}",
    },
    {
      id: "step_2",
      stepNumber: 2,
      delayDays: 2,
      delayHours: 0,
      subject: "Our story and top recommendations for you",
      bodyTemplate:
        "Hi {{customer_name}},\n\nEvery piece in our catalog is crafted with care and passion. Here are a few hand-picked favorites that our customers love.",
      ctaText: "View Best Sellers",
      ctaUrl: "https://framique.qubickle.com/store/{{store_slug}}",
    },
    {
      id: "step_3",
      stepNumber: 3,
      delayDays: 5,
      delayHours: 0,
      subject: "A special gift for your first purchase",
      bodyTemplate:
        "Hi {{customer_name}},\n\nAs a thank you for being with us, use the code WELCOME10 at checkout to receive an exclusive welcome discount on your next order.",
      ctaText: "Claim Your Gift",
      ctaUrl: "https://framique.qubickle.com/store/{{store_slug}}",
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  stats: {
    enrolledCount: 0,
    completedCount: 0,
    sentCount: 0,
  },
};

/**
 * Loads the sequences state from merchant_settings.notify_prefs.
 */
async function loadSequencesState(
  db: Client,
  merchantId: string,
): Promise<SequencesState> {
  const { data } = await db
    .from("merchant_settings")
    .select("notify_prefs")
    .eq("merchant_id", merchantId)
    .maybeSingle();

  const prefs = (data?.notify_prefs ?? {}) as {
    drip_sequences?: SequencesState;
  };

  const state = prefs.drip_sequences;
  if (!state || !state.sequences) {
    const defaultSeq = {
      ...DEFAULT_WELCOME_SEQUENCE,
      merchantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return {
      sequences: { [defaultSeq.id]: defaultSeq },
      enrollments: { [defaultSeq.id]: [] },
    };
  }

  return {
    sequences: state.sequences ?? {},
    enrollments: state.enrollments ?? {},
  };
}

/**
 * Commits sequences state to merchant_settings.notify_prefs.
 */
async function saveSequencesState(
  db: Client,
  merchantId: string,
  state: SequencesState,
): Promise<void> {
  const { data: current } = await db
    .from("merchant_settings")
    .select("notify_prefs")
    .eq("merchant_id", merchantId)
    .maybeSingle();

  const rawPrefs = (current?.notify_prefs ?? {}) as Record<string, unknown>;
  const updatedPrefs = {
    ...rawPrefs,
    drip_sequences: state,
  };

  const { error } = await db
    .from("merchant_settings")
    .update({
      notify_prefs: updatedPrefs as never,
      updated_at: new Date().toISOString(),
    })
    .eq("merchant_id", merchantId);

  if (error) {
    throw new Error(`Failed to save drip sequences: ${error.message}`);
  }
}

/**
 * Lists all drip sequences for a merchant.
 */
export async function listDripSequences(
  db: Client,
  merchantId: string,
): Promise<DripSequence[]> {
  const state = await loadSequencesState(db, merchantId);
  return Object.values(state.sequences).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

/**
 * Loads a single sequence by ID.
 */
export async function getDripSequence(
  db: Client,
  merchantId: string,
  sequenceId: string,
): Promise<{ sequence: DripSequence; enrollments: EnrolledContact[] } | null> {
  const state = await loadSequencesState(db, merchantId);
  const sequence = state.sequences[sequenceId];
  if (!sequence) return null;
  const enrollments = state.enrollments[sequenceId] ?? [];
  return { sequence, enrollments };
}

/**
 * Creates or updates a drip sequence.
 */
export async function saveDripSequence(
  db: Client,
  merchantId: string,
  input: {
    id?: string;
    name: string;
    description?: string;
    trigger: "new_subscriber" | "manual_enroll" | "cold_outreach";
    status?: "active" | "paused" | "draft";
    steps: Array<{
      id?: string;
      delayDays: number;
      delayHours: number;
      subject: string;
      bodyTemplate: string;
      ctaText?: string;
      ctaUrl?: string;
    }>;
  },
): Promise<DripSequence> {
  if (!input.name.trim()) throw new Error("Sequence name is required");
  if (!input.steps || input.steps.length === 0) {
    throw new Error("At least one sequence step is required");
  }

  const state = await loadSequencesState(db, merchantId);
  const seqId =
    input.id || `seq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const existing = state.sequences[seqId];

  const formattedSteps: DripStep[] = input.steps.map((s, idx) => ({
    id: s.id || `step_${idx + 1}_${Math.random().toString(36).slice(2, 6)}`,
    stepNumber: idx + 1,
    delayDays: Math.max(0, Number(s.delayDays) || 0),
    delayHours: Math.max(0, Number(s.delayHours) || 0),
    subject: s.subject.trim(),
    bodyTemplate: s.bodyTemplate.trim(),
    ctaText: s.ctaText?.trim(),
    ctaUrl: s.ctaUrl?.trim(),
  }));

  const sequence: DripSequence = {
    id: seqId,
    merchantId,
    name: input.name.trim(),
    description: input.description?.trim(),
    trigger: input.trigger,
    status: input.status ?? existing?.status ?? "draft",
    steps: formattedSteps,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stats: existing?.stats ?? {
      enrolledCount: 0,
      completedCount: 0,
      sentCount: 0,
    },
  };

  state.sequences[seqId] = sequence;
  if (!state.enrollments[seqId]) {
    state.enrollments[seqId] = [];
  }

  await saveSequencesState(db, merchantId, state);
  return sequence;
}

/**
 * Toggles a sequence status (active, paused, draft).
 */
export async function toggleDripSequenceStatus(
  db: Client,
  merchantId: string,
  sequenceId: string,
  status: "active" | "paused" | "draft",
): Promise<DripSequence> {
  const state = await loadSequencesState(db, merchantId);
  const sequence = state.sequences[sequenceId];
  if (!sequence) throw new Error("Sequence not found");

  sequence.status = status;
  sequence.updatedAt = new Date().toISOString();
  state.sequences[sequenceId] = sequence;

  await saveSequencesState(db, merchantId, state);
  return sequence;
}

/**
 * Deletes a sequence.
 */
export async function deleteDripSequence(
  db: Client,
  merchantId: string,
  sequenceId: string,
): Promise<boolean> {
  const state = await loadSequencesState(db, merchantId);
  if (!state.sequences[sequenceId]) return false;

  delete state.sequences[sequenceId];
  delete state.enrollments[sequenceId];

  await saveSequencesState(db, merchantId, state);
  return true;
}

/**
 * Enrolls a contact (or list of contacts) into a sequence.
 */
export async function enrollContactsInSequence(
  db: Client,
  merchantId: string,
  sequenceId: string,
  contacts: Array<{ email: string; name?: string }>,
): Promise<{ enrolled: number; skipped: number }> {
  const state = await loadSequencesState(db, merchantId);
  const sequence = state.sequences[sequenceId];
  if (!sequence) throw new Error("Sequence not found");

  const enrollments = state.enrollments[sequenceId] ?? [];
  const existingEmails = new Set(enrollments.map((e) => e.email.toLowerCase()));

  let enrolled = 0;
  let skipped = 0;

  for (const c of contacts) {
    const cleanEmail = c.email.trim().toLowerCase();
    if (!cleanEmail || existingEmails.has(cleanEmail)) {
      skipped++;
      continue;
    }

    // Check if subscriber opted out via consent_events
    const { data: subscriber } = await db
      .from("subscribers")
      .select("id, status")
      .eq("merchant_id", merchantId)
      .eq("email", cleanEmail)
      .maybeSingle();

    if (subscriber && subscriber.status === "unsubscribed") {
      skipped++;
      continue;
    }

    enrollments.push({
      id:
        subscriber?.id ||
        `contact_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      email: cleanEmail,
      name: c.name?.trim(),
      sequenceId,
      currentStep: 0,
      lastStepSentAt: null,
      enrolledAt: new Date().toISOString(),
      status: "active",
    });
    existingEmails.add(cleanEmail);
    enrolled++;
  }

  sequence.stats.enrolledCount = enrollments.length;
  sequence.updatedAt = new Date().toISOString();
  state.enrollments[sequenceId] = enrollments;

  await saveSequencesState(db, merchantId, state);
  return { enrolled, skipped };
}

/**
 * Processes due drip steps for all active sequences in a merchant store.
 */
export async function processDueDripSteps(
  db: Client,
  merchantId: string,
): Promise<{
  processed: number;
  sent: number;
  completed: number;
  suppressed: number;
}> {
  const state = await loadSequencesState(db, merchantId);
  const { data: merchant } = await db
    .from("merchants")
    .select("name, slug")
    .eq("id", merchantId)
    .maybeSingle();

  if (!merchant) return { processed: 0, sent: 0, completed: 0, suppressed: 0 };

  const now = Date.now();
  let processed = 0;
  let sent = 0;
  let completed = 0;
  let suppressed = 0;

  for (const [seqId, sequence] of Object.entries(state.sequences)) {
    if (sequence.status !== "active") continue;
    const enrollments = state.enrollments[seqId] ?? [];

    for (const enrollment of enrollments) {
      if (enrollment.status !== "active") continue;
      processed++;

      // Next step to send is currentStep + 1 (1-indexed)
      const nextStepNum = enrollment.currentStep + 1;
      const step = sequence.steps.find((s) => s.stepNumber === nextStepNum);

      if (!step) {
        // Sequence finished
        enrollment.status = "completed";
        enrollment.completedAt = new Date().toISOString();
        completed++;
        continue;
      }

      // Check required delay
      const baseTime = enrollment.lastStepSentAt
        ? new Date(enrollment.lastStepSentAt).getTime()
        : new Date(enrollment.enrolledAt).getTime();

      const requiredDelayMs =
        step.delayDays * 24 * 60 * 60 * 1000 + step.delayHours * 60 * 60 * 1000;

      if (now - baseTime < requiredDelayMs) {
        // Not due yet
        continue;
      }

      // Verify recipient has not opted out
      const { data: sub } = await db
        .from("subscribers")
        .select("id, status")
        .eq("merchant_id", merchantId)
        .eq("email", enrollment.email)
        .maybeSingle();

      if (sub && sub.status === "unsubscribed") {
        enrollment.status = "suppressed";
        suppressed++;
        continue;
      }

      // Render step email
      const vars: Record<string, string> = {
        store_name: merchant.name,
        store_slug: merchant.slug,
        customer_name: enrollment.name || "there",
      };

      const subject = interpolate(step.subject, vars);
      const bodyText = interpolate(step.bodyTemplate, vars);
      const { rebaseStoreUrl } = await import("./storefront-host.server");
      const ctaUrl = await rebaseStoreUrl(
        step.ctaUrl
          ? interpolate(step.ctaUrl, vars)
          : `https://framique.qubickle.com/store/${merchant.slug}`,
        merchantId,
      );

      const unsubscribeUrl = `https://framique.qubickle.com/unsubscribe?email=${encodeURIComponent(enrollment.email)}`;

      const html = renderEmailHtml({
        storeName: merchant.name,
        brandColor: "#0f172a",
        headerTitle: subject,
        bodyText,
        ctaText: step.ctaText || "Learn More",
        ctaUrl,
        unsubscribeUrl,
      });

      const res = await sendTenantMail(db, merchantId, {
        to: enrollment.email,
        subject,
        text: `${subject}\n\n${bodyText}\n\n${ctaUrl}\n\nUnsubscribe: ${unsubscribeUrl}`,
        html,
        unsubscribeUrl,
      });

      if (res.ok) {
        sent++;
        enrollment.currentStep = nextStepNum;
        enrollment.lastStepSentAt = new Date().toISOString();
        sequence.stats.sentCount = (sequence.stats.sentCount || 0) + 1;

        if (enrollment.currentStep >= sequence.steps.length) {
          enrollment.status = "completed";
          enrollment.completedAt = new Date().toISOString();
          sequence.stats.completedCount =
            (sequence.stats.completedCount || 0) + 1;
          completed++;
        }

        // Record audit send row in campaign_sends
        await db.from("campaign_sends").insert({
          merchant_id: merchantId,
          campaign_id: sequence.id,
          subscriber_id: enrollment.id.startsWith("sub_")
            ? enrollment.id
            : null,
          email: enrollment.email,
          status: "sent",
          sent_at: new Date().toISOString(),
        });
      }
    }
  }

  await saveSequencesState(db, merchantId, state);
  incr("framique_drip_processed_total", { sent, completed, suppressed });
  return { processed, sent, completed, suppressed };
}

/**
 * Sends a single test step to a test email address.
 */
export async function sendTestDripStep(
  db: Client,
  merchantId: string,
  sequenceId: string,
  stepNumber: number,
  testEmail: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const state = await loadSequencesState(db, merchantId);
    const sequence = state.sequences[sequenceId];
    if (!sequence) throw new Error("Sequence not found");

    const step = sequence.steps.find((s) => s.stepNumber === stepNumber);
    if (!step) throw new Error(`Step ${stepNumber} not found in sequence`);

    const { data: merchant } = await db
      .from("merchants")
      .select("name, slug")
      .eq("id", merchantId)
      .maybeSingle();

    const vars: Record<string, string> = {
      store_name: merchant?.name ?? "Framique Store",
      store_slug: merchant?.slug ?? "store",
      customer_name: "Valued Customer",
    };

    const subject = `[TEST STEP ${stepNumber}] ${interpolate(step.subject, vars)}`;
    const bodyText = interpolate(step.bodyTemplate, vars);
    const ctaUrl = step.ctaUrl
      ? interpolate(step.ctaUrl, vars)
      : "https://framique.com";

    const html = renderEmailHtml({
      storeName: merchant?.name ?? "Framique Store",
      brandColor: "#0f172a",
      headerTitle: subject,
      bodyText,
      ctaText: step.ctaText || "Learn More",
      ctaUrl,
      footerText: "This is a test preview of an automated drip step.",
    });

    const res = await sendTenantMail(db, merchantId, {
      to: testEmail,
      subject,
      text: `${subject}\n\n${bodyText}`,
      html,
    });

    return {
      ok: res.ok,
      error: res.ok ? undefined : (res as { error?: string }).error,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
