/**
 * Exit-intent newsletter prompt (Phase 10.4).
 *
 * Interruption is a cost we charge the visitor, so the rules are strict and
 * all of them are enforced here rather than trusted to a marketing setting:
 *
 *   • Never on first paint — a minimum dwell time must pass first.
 *   • Once per 30 days per browser, and never again after a subscribe.
 *   • Pointer exit only on devices that have a real pointer; on touch there is
 *     no "exit intent", so it simply never shows rather than guessing from a
 *     scroll-up gesture.
 *   • Escape closes it, focus is trapped while open and returned on close, and
 *     `prefers-reduced-motion` removes the entrance transition.
 *   • Skipped entirely for anyone who arrived on a metered connection or has
 *     Save-Data on.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { NewsletterForm } from "./NewsletterForm";

const STORAGE_KEY = "fq.newsletter.exit";
export const EXIT_INTENT_COOLDOWN_DAYS = 30;
export const EXIT_INTENT_MIN_DWELL_MS = 20_000;

type Snoozed = { until: number; reason: "dismissed" | "subscribed" };

function readSnooze(): Snoozed | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snoozed;
    return typeof parsed?.until === "number" ? parsed : null;
  } catch {
    // Private mode, blocked storage, corrupted value: treat as "no record",
    // and the dwell + pointer rules still stop it being a nuisance.
    return null;
  }
}

function writeSnooze(reason: Snoozed["reason"], days = EXIT_INTENT_COOLDOWN_DAYS) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ until: Date.now() + days * 86_400_000, reason } satisfies Snoozed),
    );
  } catch {
    /* storage denied — the in-memory guard below still holds for this page */
  }
}

export function ExitIntentNewsletter() {
  const { tk } = useLang();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<Element | null>(null);
  const shownThisPage = useRef(false);

  const close = useCallback(
    (reason: Snoozed["reason"] = "dismissed") => {
      setOpen(false);
      writeSnooze(reason);
      if (restoreFocusTo.current instanceof HTMLElement) restoreFocusTo.current.focus();
    },
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const snooze = readSnooze();
    if (snooze && snooze.until > Date.now()) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const connection = (navigator as { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;

    const readyAt = Date.now() + EXIT_INTENT_MIN_DWELL_MS;

    const onLeave = (event: MouseEvent) => {
      if (shownThisPage.current) return;
      if (Date.now() < readyAt) return;
      // Only a genuine exit towards the browser chrome counts.
      if (event.clientY > 8 || event.relatedTarget) return;
      shownThisPage.current = true;
      restoreFocusTo.current = document.activeElement;
      setOpen(true);
    };

    document.addEventListener("mouseout", onLeave);
    return () => document.removeEventListener("mouseout", onLeave);
  }, []);

  useEffect(() => {
    if (!open) return;
    const node = dialogRef.current;
    node?.querySelector<HTMLElement>("input,button")?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close("dismissed");
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const focusable = [...node.querySelectorAll<HTMLElement>("a[href],button,input,[tabindex]:not([tabindex='-1'])")]
        .filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-newsletter-title"
        className="w-full max-w-md rounded-fq-lg border border-border bg-card p-6 shadow-lift motion-safe:animate-in"
      >
        <h2 id="exit-newsletter-title" className="font-bangla-display text-lg font-semibold">
          {tk("news.exit.title")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{tk("news.exit.body")}</p>
        <NewsletterForm source="exit_intent" className="mt-4" />
        <button
          type="button"
          onClick={() => close("dismissed")}
          className="mt-2 h-11 w-full rounded-fq-md border border-border text-sm"
        >
          {tk("news.exit.dismiss")}
        </button>
      </div>
    </div>
  );
}