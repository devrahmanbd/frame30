import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Star, StarHalf, Loader2, Flame, BadgeCheck } from "lucide-react";
import {
  countdownSeconds,
  formatCountdown,
  isSessionKey,
  newSessionKey,
  reviewSummary,
  scarcity,
  starRow,
  type RecommendedProduct,
} from "@/lib/conversion";
import {
  productConversionFn,
  submitReviewFn,
  trackProductViewFn,
} from "@/lib/conversion.functions";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";

const SESSION_STORAGE_KEY = "fq_sid";

/**
 * Anonymous browsing key, created in the browser only. Read after hydration so
 * server and client render the same first frame.
 */
function useSessionKey(): string | null {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    try {
      const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (isSessionKey(existing)) {
        setKey(existing);
        return;
      }
      const fresh = newSessionKey();
      window.localStorage.setItem(SESSION_STORAGE_KEY, fresh);
      setKey(fresh);
    } catch {
      // Private mode or blocked storage: personalisation is simply off.
      setKey(null);
    }
  }, []);
  return key;
}

/* --------------------------------- stars ---------------------------------- */

export function Stars({ value, label }: { value: number; label?: string }) {
  const row = starRow(value);
  return (
    <span className="inline-flex items-center gap-0.5 text-warning-foreground" aria-label={label}>
      {row.map((kind, i) =>
        kind === "half" ? (
          <StarHalf key={i} aria-hidden className="size-4 fill-current" />
        ) : (
          <Star
            key={i}
            aria-hidden
            className={`size-4 ${kind === "full" ? "fill-current" : "opacity-30"}`}
          />
        ),
      )}
    </span>
  );
}

/* ------------------------------- scarcity --------------------------------- */

/** Stock-truthful urgency. Renders nothing when there is nothing urgent to say. */
export function ScarcityBadge({ stock, endsAt }: { stock: number; endsAt?: string | null }) {
  const { t } = useLang();
  const { level, left } = scarcity(stock);
  const [remaining, setRemaining] = useState(() => countdownSeconds(endsAt));

  useEffect(() => {
    if (!endsAt) return;
    setRemaining(countdownSeconds(endsAt));
    const id = window.setInterval(() => setRemaining(countdownSeconds(endsAt)), 1000);
    return () => window.clearInterval(id);
  }, [endsAt]);

  if (level === "none" || level === "out") {
    return null;
  }

  return (
    <p
      className={`mt-3 inline-flex items-center gap-2 rounded-fq-md px-3 py-1.5 text-xs font-medium ${
        level === "critical"
          ? "bg-danger-soft text-danger-foreground"
          : "bg-warning-soft text-warning-foreground"
      }`}
    >
      <Flame aria-hidden className="size-3.5" />
      <span>{t(`Only ${left} left`, `মাত্র ${left} টি বাকি`)}</span>
      {remaining > 0 && (
        <span className="tabular-nums opacity-80">· {formatCountdown(remaining)}</span>
      )}
    </p>
  );
}

/* --------------------------------- rails ---------------------------------- */

function ProductRail({
  slug,
  title,
  items,
  currency,
}: {
  slug: string;
  title: string;
  items: RecommendedProduct[];
  currency: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-12">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              to="/store/$slug/p/$productSlug"
              params={{ slug, productSlug: item.slug }}
              className="group block rounded-fq-md border border-border bg-card p-2 transition-colors hover:border-primary"
            >
              <div className="aspect-square overflow-hidden rounded-fq-sm bg-muted">
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.title}
                    loading="lazy"
                    decoding="async"
                    width={300}
                    height={300}
                    className="size-full object-cover"
                  />
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-xs font-medium group-hover:text-primary">
                {item.title}
              </p>
              {item.price_minor != null && (
                <p className="money mt-1 text-xs text-muted-foreground">
                  {fmtMinor(Number(item.price_minor), currency)}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------ review form -------------------------------- */

function ReviewForm({
  slug,
  productId,
  onSubmitted,
}: {
  slug: string;
  productId: string;
  onSubmitted: () => void;
}) {
  const { t } = useLang();
  const submit = useServerFn(submitReviewFn);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
  }, []);

  const mutation = useMutation({
    mutationFn: () => submit({ data: { slug, productId, rating, title, body, authorName: "" } }),
    onSuccess: () => {
      setTitle("");
      setBody("");
      onSubmitted();
      toast.success(
        t("Thanks — your review is awaiting moderation.", "ধন্যবাদ — রিভিউটি যাচাইয়ের অপেক্ষায়।"),
      );
    },
    onError: (error: Error) => {
      const message = /rate_limit|429/i.test(error.message)
        ? t("You have reviewed enough for now. Try later.", "একটু পরে আবার চেষ্টা করুন।")
        : t("Could not save your review.", "রিভিউ সংরক্ষণ করা যায়নি।");
      toast.error(message);
    },
  });

  if (signedIn === false) {
    return (
      <p className="mt-4 rounded-fq-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        {t("Sign in to write a review.", "রিভিউ লিখতে সাইন ইন করুন।")}
      </p>
    );
  }
  if (signedIn === null) return null;

  const invalid = title.trim().length < 3 || body.trim().length < 10;

  return (
    <form
      className="mt-6 rounded-fq-md border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid) mutation.mutate();
      }}
    >
      <fieldset disabled={mutation.isPending}>
        <legend className="text-sm font-semibold">{t("Write a review", "রিভিউ লিখুন")}</legend>

        <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label={t("Rating", "রেটিং")}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n}`}
              onClick={() => setRating(n)}
              className="min-h-11 min-w-11 text-warning-foreground"
            >
              <Star aria-hidden className={`size-6 ${n <= rating ? "fill-current" : "opacity-30"}`} />
            </button>
          ))}
        </div>

        <label className="mt-4 block text-xs font-medium" htmlFor="review-title">
          {t("Headline", "শিরোনাম")}
        </label>
        <input
          id="review-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={140}
          className="mt-1 min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm"
        />

        <label className="mt-3 block text-xs font-medium" htmlFor="review-body">
          {t("Your experience", "আপনার অভিজ্ঞতা")}
        </label>
        <textarea
          id="review-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={4000}
          className="mt-1 w-full rounded-fq-md border border-border bg-background p-3 text-sm"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            "Reviews are published after moderation. Verified badges are added automatically.",
            "রিভিউ যাচাইয়ের পর প্রকাশিত হয়।",
          )}
        </p>

        <button
          type="submit"
          disabled={invalid || mutation.isPending}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-fq-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {mutation.isPending && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {t("Submit review", "রিভিউ জমা দিন")}
        </button>
      </fieldset>
    </form>
  );
}

/* ------------------------- the below-the-fold block ------------------------ */

/**
 * Reviews, recommendations and recently-viewed for a product page.
 *
 * Loaded after hydration rather than in the route loader so the priced, indexable
 * part of the page is never delayed by personalisation, and so a slow or failing
 * conversion query degrades to an empty section instead of a 500.
 */
export function ProductConversion({
  slug,
  productId,
  currency,
}: {
  slug: string;
  productId: string;
  currency: string;
}) {
  const { t } = useLang();
  const qc = useQueryClient();
  const sessionKey = useSessionKey();
  const load = useServerFn(productConversionFn);
  const track = useServerFn(trackProductViewFn);
  const tracked = useRef<string | null>(null);

  const queryKey = useMemo(
    () => ["conversion", slug, productId, sessionKey] as const,
    [slug, productId, sessionKey],
  );

  const bundle = useQuery({
    queryKey,
    staleTime: 60_000,
    retry: 1,
    queryFn: () =>
      load({ data: { slug, productId, ...(sessionKey ? { sessionKey } : {}) } }),
  });

  // One beacon per product per session key, after the page is interactive.
  useEffect(() => {
    if (!sessionKey) return;
    const stamp = `${productId}:${sessionKey}`;
    if (tracked.current === stamp) return;
    tracked.current = stamp;
    void track({ data: { slug, productId, sessionKey } }).catch(() => undefined);
  }, [slug, productId, sessionKey, track]);

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["conversion", slug, productId] });
  }, [qc, slug, productId]);

  const summary = reviewSummary(bundle.data?.agg ?? null);
  const reviews = bundle.data?.reviews ?? [];

  return (
    <div className="mt-14 border-t border-border pt-10">
      <section aria-labelledby="reviews-heading">
        <h2 id="reviews-heading" className="text-lg font-semibold">
          {t("Customer reviews", "ক্রেতার রিভিউ")}
        </h2>

        {bundle.isLoading ? (
          <div className="mt-4 h-24 animate-pulse rounded-fq-md bg-muted" aria-hidden />
        ) : (
          <div className="mt-4 grid gap-6 md:grid-cols-[220px_1fr]">
            <div>
              <p className="text-3xl font-semibold tabular-nums">{summary.mean.toFixed(1)}</p>
              <Stars
                value={summary.rounded}
                label={t(`${summary.mean.toFixed(1)} out of 5`, `৫ এর মধ্যে ${summary.mean.toFixed(1)}`)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t(`${summary.count} reviews`, `${summary.count} টি রিভিউ`)}
              </p>
              <ul className="mt-3 space-y-1">
                {summary.bars.map((bar) => (
                  <li key={bar.stars} className="flex items-center gap-2 text-xs">
                    <span className="w-3 tabular-nums">{bar.stars}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full bg-warning-foreground"
                        style={{ width: `${bar.pct}%` }}
                      />
                    </span>
                    <span className="w-8 text-right tabular-nums text-muted-foreground">
                      {bar.pct}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              {reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("No reviews yet. Be the first.", "এখনো কোনো রিভিউ নেই।")}
                </p>
              ) : (
                <ul className="space-y-5">
                  {reviews.map((review) => (
                    <li key={review.id} className="border-b border-border pb-5 last:border-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Stars value={review.rating} label={`${review.rating}/5`} />
                        <span className="text-sm font-medium">{review.title}</span>
                        {review.verified_purchase && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] text-success-foreground">
                            <BadgeCheck aria-hidden className="size-3" />
                            {t("Verified purchase", "যাচাইকৃত ক্রয়")}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                        {review.body}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {review.author_name || t("Customer", "ক্রেতা")} ·{" "}
                        {new Date(review.created_at).toLocaleDateString()}
                      </p>
                      {review.reply && (
                        <div className="mt-3 rounded-fq-md bg-muted/50 p-3 text-sm">
                          <p className="text-xs font-semibold">{t("Store reply", "স্টোরের উত্তর")}</p>
                          <p className="mt-1 text-muted-foreground">{review.reply.body}</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <ReviewForm slug={slug} productId={productId} onSubmitted={refresh} />
            </div>
          </div>
        )}
      </section>

      <ProductRail
        slug={slug}
        currency={currency}
        title={t("You may also like", "আপনার পছন্দ হতে পারে")}
        items={bundle.data?.recommendations ?? []}
      />
      <ProductRail
        slug={slug}
        currency={currency}
        title={t("Recently viewed", "সম্প্রতি দেখা")}
        items={bundle.data?.recentlyViewed ?? []}
      />
    </div>
  );
}
