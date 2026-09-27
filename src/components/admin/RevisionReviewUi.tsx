import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "@/components/icons/tabler";
import { useLang } from "@/lib/i18n";
import { Empty, Pill, Section } from "@/components/admin/SupportDeskUi";
import {
  applyRevisionFn,
  approveRevisionFn,
  listRevisionReviewsFn,
  rejectRevisionFn,
} from "@/lib/support-revision.functions";
import type {
  DisplayReview,
  ReviewStatus,
} from "@/lib/support-revision.functions";

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (unit-tested in RevisionReviewUi.test.tsx)
// ─────────────────────────────────────────────────────────────────────────────

export type RevisionFilter = ReviewStatus | "all";

export const REVISION_FILTERS: RevisionFilter[] = [
  "pending",
  "approved",
  "rejected",
  "applied",
];

const REVIEW_CODE_RE = /review_[a-z_]+/;

/** Extract a `review_*` code from a thrown server-fn failure. */
export function reviewErrorCode(error: unknown): string | null {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";
  if (!raw) return null;
  const match = REVIEW_CODE_RE.exec(raw);
  return match ? match[0] : null;
}

export const REVIEW_ERROR_COPY: Record<string, { en: string; bn: string }> = {
  review_not_found: {
    en: "That revision is no longer in the queue — it may already have been handled.",
    bn: "সেই রিভিশনটি আর সারিতে নেই — হয়তো ইতিমধ্যে নিষ্পত্তি হয়েছে।",
  },
  review_not_pending: {
    en: "That revision was already decided — refresh the queue to see its latest state.",
    bn: "সেই রিভিশনটির সিদ্ধান্ত হয়ে গেছে — সর্বশেষ অবস্থা দেখতে সারি রিফ্রেশ করুন।",
  },
  review_not_approved: {
    en: "Only approved revisions can be applied. Approve it first.",
    bn: "শুধু অনুমোদিত রিভিশন প্রয়োগ করা যায়। আগে অনুমোদন করুন।",
  },
  review_rescreen_blocked: {
    en: "Blocked by the safety screen (forbidden claim or leak). Edit the reply and try again.",
    bn: "নিরাপত্তা যাচাইয়ে আটকে গেছে (নিষিদ্ধ দাবি বা তথ্য ফাঁস)। উত্তর সম্পাদনা করে আবার চেষ্টা করুন।",
  },
  review_approve_failed: {
    en: "Could not save the approval. Try again.",
    bn: "অনুমোদন সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
  },
  review_reject_failed: {
    en: "Could not save the rejection. Try again.",
    bn: "প্রত্যাখ্যান সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
  },
  review_apply_failed: {
    en: "Could not apply the revision. Try again.",
    bn: "রিভিশন প্রয়োগ করা যায়নি। আবার চেষ্টা করুন।",
  },
};

export const REVIEW_ERROR_FALLBACK = {
  en: "Something went wrong saving the decision. Try again.",
  bn: "সিদ্ধান্ত সংরক্ষণে সমস্যা হয়েছে। আবার চেষ্টা করুন।",
} as const;

/** Friendly operator copy for any mutation failure (ReviewError-aware). */
export function friendlyReviewError(
  error: unknown,
  lang: "en" | "bn" = "en",
): string {
  const code = reviewErrorCode(error);
  const entry =
    (code ? REVIEW_ERROR_COPY[code] : undefined) ?? REVIEW_ERROR_FALLBACK;
  return lang === "bn" ? entry.bn : entry.en;
}

/** Client-side status filter (the server filters too; this is idempotent). */
export function filterReviewsByStatus(
  reviews: DisplayReview[],
  status: RevisionFilter,
): DisplayReview[] {
  if (status === "all") return reviews;
  return reviews.filter((r) => r.status === status);
}

export function formatScore(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(2)
    : "—";
}

export type AppliedAction =
  | { kind: "kb"; ref: string }
  | { kind: "dpo"; ref: string }
  | { kind: "reject"; reason: string }
  | { kind: "other"; raw: string };

/**
 * `applied_action` carries `kb_published:<ref>`, `dpo_pair:<ref>` or
 * `reject:<reason>` (the table has no separate reason column by design).
 */
export function parseAppliedAction(
  action: string | null | undefined,
): AppliedAction | null {
  if (!action) return null;
  if (action.startsWith("kb_published:"))
    return { kind: "kb", ref: action.slice("kb_published:".length) };
  if (action.startsWith("dpo_pair:"))
    return { kind: "dpo", ref: action.slice("dpo_pair:".length) };
  if (action.startsWith("reject:"))
    return { kind: "reject", reason: action.slice("reject:".length) };
  return { kind: "other", raw: action };
}

const SEVERITY_TONE = {
  severe: "bad",
  low: "warn",
  none: "muted",
} as const;

const STATUS_TONE = {
  pending: "warn",
  approved: "ok",
  rejected: "muted",
  applied: "ok",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Presentational queue (props-driven; renders under renderToStaticMarkup)
// ─────────────────────────────────────────────────────────────────────────────

export type ApplyResult = {
  id: string;
  action: string;
  ref: string;
};

export type RevisionReviewUiProps = {
  reviews: DisplayReview[];
  status: RevisionFilter;
  onStatusChange: (next: RevisionFilter) => void;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  applyResult: ApplyResult | null;
  onApprove: (id: string, editedReply: string | null) => Promise<unknown>;
  onReject: (id: string, reason: string | null) => Promise<unknown>;
  onApply: (id: string) => Promise<unknown>;
};

const field =
  "w-full rounded-fq-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const btnGhost =
  "inline-flex items-center gap-1 inline-flex min-h-8 items-center rounded-fq-md border border-border px-2 py-1 text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const btnPrimary =
  "inline-flex items-center gap-1 rounded-fq-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export function RevisionReviewUi({
  reviews,
  status,
  onStatusChange,
  isPending,
  isError,
  onRetry,
  applyResult,
  onApprove,
  onReject,
  onApply,
}: RevisionReviewUiProps) {
  const { t } = useLang();
  const shown = filterReviewsByStatus(reviews, status);

  return (
    <Section
      title={t("Revision review", "রিভিশন পর্যালোচনা")}
      description={t(
        "Poor or severe AI answers, rewritten by the reviewer loop. Approve, edit, or reject — applying publishes knowledge or saves a training pair.",
        "দুর্বল বা গুরুতর এআই উত্তর — পর্যালোচনা লুপের পুনর্লিখন। অনুমোদন, সম্পাদনা বা প্রত্যাখ্যান করুন।",
      )}
      action={
        <div className="flex flex-wrap gap-1" role="group" aria-label="status">
          {REVISION_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onStatusChange(s)}
              className={`${btnGhost} ${status === s ? "border-primary text-primary" : ""}`}
            >
              {s}
            </button>
          ))}
        </div>
      }
    >
      {applyResult ? (
        <p
          role="status"
          className="mb-3 rounded-fq-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs"
        >
          {applyResult.action === "kb_published"
            ? t(
                `Applied as a knowledge-base article (${applyResult.ref}).`,
                `নলেজ-বেস নিবন্ধ হিসেবে প্রকাশিত (${applyResult.ref})।`,
              )
            : t(
                `Saved as a training pair (${applyResult.ref}).`,
                `প্রশিক্ষণ জোড়া হিসেবে সংরক্ষিত (${applyResult.ref})।`,
              )}
        </p>
      ) : null}

      {isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t("Loading revisions…", "রিভিশন লোড হচ্ছে…")}
        </p>
      ) : isError ? (
        <div className="space-y-2 py-4 text-center">
          <p className="text-sm text-destructive">
            {t(
              "The revision queue could not be loaded. Try again.",
              "রিভিশন সারি লোড করা যায়নি। আবার চেষ্টা করুন।",
            )}
          </p>
          <button type="button" className={btnGhost} onClick={onRetry}>
            {t("Retry", "পুনরায় চেষ্টা")}
          </button>
        </div>
      ) : shown.length === 0 ? (
        <Empty>
          {t(
            "No revisions in this state.",
            "এই অবস্থায় কোনো রিভিশন নেই।",
          )}
        </Empty>
      ) : (
        <ul className="space-y-4">
          {shown.map((review) => (
            <li
              key={review.id}
              className="rounded-fq-md border border-border/60 p-3"
            >
              <ReviewCard
                review={review}
                onApprove={onApprove}
                onReject={onReject}
                onApply={onApply}
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function ReviewCard({
  review,
  onApprove,
  onReject,
  onApply,
}: {
  review: DisplayReview;
  onApprove: (id: string, editedReply: string | null) => Promise<unknown>;
  onReject: (id: string, reason: string | null) => Promise<unknown>;
  onApply: (id: string) => Promise<unknown>;
}) {
  const { t, lang } = useLang();
  const [edit, setEdit] = useState(review.revised_reply);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | "apply" | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const score = review.score_json;
  const properness = score.properness ?? null;
  const applied = parseAppliedAction(review.applied_action);

  async function run(
    kind: "approve" | "reject" | "apply",
    fn: () => Promise<unknown>,
  ) {
    setBusy(kind);
    setFieldError(null);
    try {
      await fn();
    } catch (err) {
      setFieldError(friendlyReviewError(err, lang));
    } finally {
      setBusy(null);
    }
  }

  return (
    <article>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">
          {review.turn_ref}
        </span>
        <Pill tone={SEVERITY_TONE[review.severity] ?? "muted"}>
          {review.severity}
        </Pill>
        <Pill tone={STATUS_TONE[review.status] ?? "muted"}>
          {review.status}
        </Pill>
        <span className="text-[11px] text-muted-foreground">
          {new Date(review.created_at).toLocaleString()}
        </span>
      </div>

      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
        <div className="flex gap-1">
          <dt className="text-muted-foreground">
            {t("Groundedness", "ভিত্তি")}:
          </dt>
          <dd className="font-medium">{formatScore(score.groundedness)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-muted-foreground">{t("Tone", "সুর")}:</dt>
          <dd className="font-medium">{formatScore(score.tone)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-muted-foreground">{t("Policy", "নীতি")}:</dt>
          <dd className="font-medium">{formatScore(score.policy)}</dd>
        </div>
        {properness ? (
          <>
            <div className="flex gap-1">
              <dt className="text-muted-foreground">
                {t("Clarity", "স্পষ্টতা")}:
              </dt>
              <dd className="font-medium">
                {formatScore(properness.clarity)}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-muted-foreground">
                {t("Courtesy", "শিষ্টাচার")}:
              </dt>
              <dd className="font-medium">
                {formatScore(properness.courtesy)}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-muted-foreground">
                {t("BN fluency", "বাংলা সাবলীলতা")}:
              </dt>
              <dd className="font-medium">
                {formatScore(properness.bnFluency)}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-muted-foreground">
                {t("Humility", "বিনয়")}:
              </dt>
              <dd className="font-medium">
                {formatScore(properness.humility)}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-muted-foreground">
                {t("No overclaim", "বাড়াবাড়ি নয়")}:
              </dt>
              <dd className="font-medium">
                {formatScore(properness.noOverclaim)}
              </dd>
            </div>
          </>
        ) : null}
      </dl>

      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <div className="rounded-fq-md border border-border/60 p-2">
          <p className="text-[11px] font-medium text-muted-foreground">
            {t("Original reply", "মূল উত্তর")}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm">
            {review.original_reply}
          </p>
        </div>
        <div className="rounded-fq-md border border-primary/30 p-2">
          <p className="text-[11px] font-medium text-muted-foreground">
            {t("Revised reply", "সংশোধিত উত্তর")}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm">
            {review.revised_reply}
          </p>
        </div>
      </div>

      {score.rationale ? (
        <p className="mt-2 text-xs italic text-muted-foreground">
          {score.rationale}
        </p>
      ) : null}

      {review.reviewer || review.reviewed_at ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {review.reviewer ?? t("Operator", "অপারেটর")}
          {review.reviewed_at
            ? ` · ${new Date(review.reviewed_at).toLocaleString()}`
            : ""}
        </p>
      ) : null}

      {applied && review.status === "applied" ? (
        <p className="mt-2 text-xs">
          <Pill tone="ok">
            {applied.kind === "kb"
              ? `kb_published · ${applied.ref}`
              : applied.kind === "dpo"
                ? `dpo_pair · ${applied.ref}`
                : applied.kind === "reject"
                  ? `rejected · ${applied.reason}`
                  : applied.raw}
          </Pill>
        </p>
      ) : null}

      {applied && applied.kind === "reject" && review.status === "rejected" ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("Reason", "কারণ")}: {applied.reason}
        </p>
      ) : null}

      {review.status === "pending" ? (
        <div className="mt-3 space-y-2">
          <label className="block text-xs text-muted-foreground">
            {t("Edit before approving (optional)", "অনুমোদনের আগে সম্পাদনা")}
            <textarea
              value={edit}
              onChange={(e) => setEdit(e.target.value.slice(0, 4000))}
              rows={3}
              className={`mt-1 ${field}`}
              aria-label="Edited reply"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={btnPrimary}
              disabled={busy !== null}
              onClick={() =>
                run("approve", () =>
                  onApprove(
                    review.id,
                    edit.trim() && edit.trim() !== review.revised_reply
                      ? edit.trim()
                      : null,
                  ),
                )
              }
            >
              {busy === "approve" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              {t("Approve", "অনুমোদন")}
            </button>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 300))}
              placeholder={t("Rejection reason", "প্রত্যাখ্যানের কারণ")}
              aria-label="Rejection reason"
              className={`${field} !w-auto flex-1`}
            />
            <button
              type="button"
              className={btnGhost}
              disabled={busy !== null}
              onClick={() =>
                run("reject", () =>
                  onReject(review.id, reason.trim() || null),
                )
              }
            >
              {busy === "reject" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              {t("Reject", "প্রত্যাখ্যান")}
            </button>
          </div>
        </div>
      ) : null}

      {review.status === "approved" ? (
        <div className="mt-3">
          <button
            type="button"
            className={btnPrimary}
            disabled={busy !== null}
            onClick={() => run("apply", () => onApply(review.id))}
          >
            {busy === "apply" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {t("Apply", "প্রয়োগ")}
          </button>
        </div>
      ) : null}

      {fieldError ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {fieldError}
        </p>
      ) : null}
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Connected panel (server fns + react-query; mounted by the desk Revisions tab)
// ─────────────────────────────────────────────────────────────────────────────

export function RevisionReviewPanel() {
  const { t, lang } = useLang();
  const qc = useQueryClient();
  const [status, setStatus] = useState<RevisionFilter>("pending");
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const listFn = useServerFn(listRevisionReviewsFn);
  const approveFn = useServerFn(approveRevisionFn);
  const rejectFn = useServerFn(rejectRevisionFn);
  const applyFn = useServerFn(applyRevisionFn);

  const query = useQuery({
    queryKey: ["support-revision-reviews", status],
    queryFn: () => listFn({ data: { status } }),
    staleTime: 10_000,
  });

  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ["support-revision-reviews"] });

  async function handleApprove(id: string, editedReply: string | null) {
    try {
      await approveFn({ data: { id, editedReply } });
      toast.success(t("Revision approved", "রিভিশন অনুমোদিত"));
      invalidate();
    } catch (err) {
      toast.error(friendlyReviewError(err, lang));
      throw err;
    }
  }

  async function handleReject(id: string, reason: string | null) {
    try {
      await rejectFn({ data: { id, reason } });
      toast.success(t("Revision rejected", "রিভিশন প্রত্যাখ্যাত"));
      invalidate();
    } catch (err) {
      toast.error(friendlyReviewError(err, lang));
      throw err;
    }
  }

  async function handleApply(id: string) {
    try {
      const res = (await applyFn({ data: { id } })) as {
        action: string;
        ref: string;
      };
      setApplyResult({ id, action: res.action, ref: res.ref });
      toast.success(
        res.action === "kb_published"
          ? t("Published to the knowledge base", "নলেজ বেসে প্রকাশিত")
          : t("Saved as a training pair", "প্রশিক্ষণ জোড়া হিসেবে সংরক্ষিত"),
      );
      invalidate();
    } catch (err) {
      toast.error(friendlyReviewError(err, lang));
      throw err;
    }
  }

  return (
    <RevisionReviewUi
      reviews={(query.data ?? []) as DisplayReview[]}
      status={status}
      onStatusChange={(next) => {
        setStatus(next);
        setApplyResult(null);
      }}
      isPending={query.isPending}
      isError={query.isError}
      onRetry={() => void query.refetch()}
      applyResult={applyResult}
      onApprove={handleApprove}
      onReject={handleReject}
      onApply={handleApply}
    />
  );
}
