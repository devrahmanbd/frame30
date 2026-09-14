import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { unsubscribeFn } from "@/lib/marketing.functions";
import { unsubscribeNewsletterFn } from "@/lib/newsletter.functions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  head: () => ({
    meta: [
      { title: "Unsubscribe — Framique" },
      {
        name: "description",
        content: "Stop receiving marketing emails from this store with one click.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Unsubscribe" },
      { property: "og:description", content: "Manage your email preferences." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const { t } = useLang();
  const { token } = Route.useSearch();
  const [state, setState] = useState<"idle" | "working" | "done" | "already" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage(t("The link is incomplete — please use the button from the email again.", "লিঙ্কটি অসম্পূর্ণ — ইমেইলের বোতামটি আবার ব্যবহার করুন।"));
      return;
    }
    setState("working");
    // One link surface, two lists: the platform newsletter and a merchant's
    // storefront audience. Tokens are disjoint, so we try the platform list
    // first and fall through — the person clicking must never have to know
    // which system sent the email they want to stop.
    unsubscribeNewsletterFn({ data: { token } })
      .then(async (res) => {
        if (res.status === "done" || res.status === "already") {
          setState(res.status === "already" ? "already" : "done");
          setMessage(res.email ?? "");
          return;
        }
        const merchant = await unsubscribeFn({ data: { token } });
        setState(merchant.alreadyDone ? "already" : "done");
        setMessage(merchant.email);
      })
      .catch((e: Error) => {
        setState("error");
        setMessage(e.message);
      });
  }, [token]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4 py-16 text-center">
      <h1 className="font-bangla-display text-2xl font-semibold">{t("Unsubscribe email", "ইমেইল বন্ধ করা")}</h1>
      <p role="status" aria-live="polite" className="mt-4 text-sm text-muted-foreground">
        {state === "working" && t("Processing…", "প্রক্রিয়া চলছে…")}
        {state === "done" && t(`${message} — you will no longer receive marketing emails.`, `${message} — আপনাকে আর কোনো মার্কেটিং ইমেইল পাঠানো হবে না।`)}
        {state === "already" && t(`${message} was already unsubscribed.`, `${message} আগেই আনসাবস্ক্রাইব করা হয়েছে।`)}
        {state === "error" && message}
      </p>
      <Link to="/" className="mt-6 inline-flex min-h-11 items-center justify-center text-sm text-primary underline">
        {t("Back to home", "হোমে ফিরে যান")}
      </Link>
    </main>
  );
}
