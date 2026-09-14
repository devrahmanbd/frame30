import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PublicShell } from "@/components/public/PublicShell";
import { verifyNewsletterFn } from "@/lib/newsletter.functions";
import { useLang } from "@/lib/i18n";

/**
 * Double opt-in confirmation landing page.
 *
 * The confirmation itself is a POST from the client rather than work done in
 * the loader: mail scanners and link previewers issue GETs on every URL in an
 * email, and a loader that confirmed on GET would mean corporate spam filters
 * silently opting people in. `noindex` for the same reason a token URL should
 * never be in an index.
 */
export const Route = createFileRoute("/newsletter/verify")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  head: () => ({
    meta: [
      { title: "Confirm your newsletter subscription — Framique" },
      {
        name: "description",
        content: "Confirm the email address you used to subscribe to the Framique merchant newsletter.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Confirm your newsletter subscription" },
      { property: "og:description", content: "One click confirms your Framique newsletter subscription." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VerifyPage,
});

type State = "idle" | "working" | "confirmed" | "already" | "expired" | "invalid";

function VerifyPage() {
  const { tk } = useLang();
  const { token } = Route.useSearch();
  const [state, setState] = useState<State>("idle");

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    let cancelled = false;
    setState("working");
    verifyNewsletterFn({ data: { token } })
      .then((res) => {
        if (cancelled) return;
        if (res.status === "confirmed") setState("confirmed");
        else if (res.status === "already_confirmed") setState("already");
        else if (res.status === "expired") setState("expired");
        else setState("invalid");
      })
      .catch(() => {
        if (!cancelled) setState("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const message =
    state === "working" || state === "idle"
      ? tk("news.verify.working")
      : state === "confirmed"
        ? tk("news.verify.confirmed")
        : state === "already"
          ? tk("news.verify.already")
          : state === "expired"
            ? tk("news.verify.expired")
            : tk("news.verify.invalid");

  return (
    <PublicShell>
      <section className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="font-bangla-display text-2xl font-semibold">{tk("news.verify.title")}</h1>
        <p role="status" aria-live="polite" className="mt-4 text-sm text-muted-foreground">
          {message}
        </p>
        <Link to="/" className="mt-8 inline-flex min-h-11 w-full sm:w-auto items-center justify-center rounded-fq-md border border-border px-5 text-sm font-medium">
          Framique
        </Link>
      </section>
    </PublicShell>
  );
}