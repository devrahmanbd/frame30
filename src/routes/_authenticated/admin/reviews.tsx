import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, BadgeCheck } from "lucide-react";
import { useMerchant } from "@/hooks/use-merchant";
import { Stars } from "@/components/store/ConversionSurfaces";
import {
  moderateReviewFn,
  replyReviewFn,
  reviewQueueFn,
} from "@/lib/conversion.functions";

export const Route = createFileRoute("/_authenticated/admin/reviews")({
  head: () => ({
    meta: [
      { title: "Review moderation — Framique Admin" },
      {
        name: "description",
        content:
          "Approve, reject and reply to customer product reviews before they appear on your storefront.",
      },
      { property: "og:title", content: "Review moderation" },
      {
        property: "og:description",
        content: "Moderate customer reviews and publish store replies.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReviewModeration,
});

type Filter = "pending" | "published" | "rejected" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "pending", label: "Needs review" },
  { key: "published", label: "Published" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

function ReviewModeration() {
  const qc = useQueryClient();
  const { data: merchant } = useMerchant();
  const loadQueue = useServerFn(reviewQueueFn);
  const moderate = useServerFn(moderateReviewFn);
  const reply = useServerFn(replyReviewFn);
  const [filter, setFilter] = useState<Filter>("pending");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const queue = useQuery({
    queryKey: ["review-queue", merchant?.id],
    enabled: !!merchant,
    queryFn: () => loadQueue({ data: { merchantId: merchant!.id } }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["review-queue", merchant?.id] });
  };

  const setStatus = useMutation({
    mutationFn: (vars: {
      reviewId: string;
      productId: string;
      status: "published" | "rejected" | "pending";
      note: string;
    }) => moderate({ data: { merchantId: merchant!.id, ...vars } }),
    onSuccess: () => {
      invalidate();
      toast.success("Review updated");
    },
    onError: () => toast.error("Could not update that review"),
  });

  const publishReply = useMutation({
    mutationFn: (vars: { reviewId: string; productId: string; body: string }) =>
      reply({ data: { merchantId: merchant!.id, ...vars } }),
    onSuccess: (_r, vars) => {
      setDrafts((d) => ({ ...d, [vars.reviewId]: "" }));
      invalidate();
      toast.success("Reply published");
    },
    onError: () => toast.error("Could not publish that reply"),
  });

  const rows = useMemo(() => {
    const all = queue.data ?? [];
    return filter === "all" ? all : all.filter((r) => r.status === filter);
  }, [queue.data, filter]);

  const counts = useMemo(() => {
    const all = queue.data ?? [];
    return {
      pending: all.filter((r) => r.status === "pending").length,
      published: all.filter((r) => r.status === "published").length,
      rejected: all.filter((r) => r.status === "rejected").length,
      all: all.length,
    } as Record<Filter, number>;
  }, [queue.data]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header>
        <h1 className="text-xl font-semibold">Review moderation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nothing reaches your storefront until you publish it. Verified badges are decided from
          order history, not from what the reviewer claims.
        </p>
      </header>

      <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Review status">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`min-h-11 rounded-fq-md border px-4 text-sm ${
              filter === f.key
                ? "border-primary bg-info-soft text-info-foreground"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            {f.label}
            <span className="ml-2 tabular-nums opacity-70">{counts[f.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {queue.isLoading && (
        <div className="mt-6 h-40 animate-pulse rounded-fq-md bg-muted" aria-hidden />
      )}
      {queue.isError && (
        <p className="mt-6 rounded-fq-md bg-danger-soft p-4 text-sm text-danger-foreground">
          Could not load the review queue.{" "}
          <button type="button" className="underline" onClick={() => void queue.refetch()}>
            Retry
          </button>
        </p>
      )}

      {queue.isSuccess && rows.length === 0 && (
        <p className="mt-6 rounded-fq-md border border-border bg-card p-6 text-sm text-muted-foreground">
          Nothing here. New reviews land in “Needs review”.
        </p>
      )}

      <ul className="mt-6 space-y-4">
        {rows.map((r) => {
          const busy =
            (setStatus.isPending && setStatus.variables?.reviewId === r.id) ||
            (publishReply.isPending && publishReply.variables?.reviewId === r.id);
          return (
            <li key={r.id} className="rounded-fq-md border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars value={r.rating} label={`${r.rating} of 5`} />
                  <span className="text-sm font-medium">{r.title}</span>
                  {r.verified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] text-success-foreground">
                      <BadgeCheck aria-hidden className="size-3" /> Verified
                    </span>
                  )}
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {r.status}
                </span>
              </div>

              <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{r.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.productTitle} · {r.authorName || "Customer"} ·{" "}
                {new Date(r.createdAt).toLocaleString()}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {r.status !== "published" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setStatus.mutate({
                        reviewId: r.id,
                        productId: r.productId,
                        status: "published",
                        note: "",
                      })
                    }
                    className="min-h-11 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    Publish
                  </button>
                )}
                {r.status !== "rejected" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const note = window.prompt("Reason for rejecting (kept internal)") ?? "";
                      setStatus.mutate({
                        reviewId: r.id,
                        productId: r.productId,
                        status: "rejected",
                        note,
                      });
                    }}
                    className="min-h-11 rounded-fq-md border border-border px-4 text-sm disabled:opacity-50"
                  >
                    Reject
                  </button>
                )}
                {busy && <Loader2 aria-hidden className="size-4 animate-spin self-center" />}
              </div>

              <div className="mt-4 border-t border-border pt-3">
                {r.reply ? (
                  <p className="text-sm">
                    <span className="font-medium">Your reply: </span>
                    <span className="text-muted-foreground">{r.reply}</span>
                  </p>
                ) : (
                  <form
                    className="flex flex-col gap-2 sm:flex-row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const body = (drafts[r.id] ?? "").trim();
                      if (body.length < 2) return;
                      publishReply.mutate({ reviewId: r.id, productId: r.productId, body });
                    }}
                  >
                    <label className="sr-only" htmlFor={`reply-${r.id}`}>
                      Public reply
                    </label>
                    <input
                      id={`reply-${r.id}`}
                      value={drafts[r.id] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                      placeholder="Reply publicly…"
                      maxLength={2000}
                      className="min-h-11 flex-1 rounded-fq-md border border-border bg-background px-3 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={busy || (drafts[r.id] ?? "").trim().length < 2}
                      className="min-h-11 rounded-fq-md border border-border px-4 text-sm disabled:opacity-50"
                    >
                      Reply
                    </button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
