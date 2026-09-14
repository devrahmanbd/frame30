/**
 * Phase 10.4 — the newsletter form.
 *
 * Three placements share one component, because three copies of a consent
 * form is three chances for one of them to lose the consent checkbox.
 *
 * Accessibility and honesty notes:
 *   • The consent checkbox is real and required. No pre-tick, no "by
 *     subscribing you agree" small print doing the work of a control.
 *   • The honeypot is `aria-hidden`, `tabindex=-1` and moved off-screen rather
 *     than `display:none`, so a screen reader never announces it and a real
 *     keyboard user can never land in it.
 *   • Status is announced through a single `aria-live="polite"` region, and
 *     errors move focus back to the input.
 *   • The success message is the same for a new address and one already on the
 *     list — the server refuses to leak that difference, and so does the UI.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useLang } from "@/lib/i18n";
import { subscribeNewsletterFn } from "@/lib/newsletter.functions";
import type { NewsletterSource } from "@/lib/newsletter";

type FormState = "idle" | "submitting" | "done" | "error";

export function NewsletterForm({
  source = "footer",
  variant = "stacked",
  className = "",
}: {
  source?: NewsletterSource;
  variant?: "stacked" | "inline";
  className?: string;
}) {
  const { tk, lang } = useLang();
  const inputId = useId();
  const consentId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const renderedAt = useRef<number>(Date.now());

  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState("");

  // The timing check compares against first paint of *this* form, so a form
  // rendered during SSR and hydrated minutes later is not judged as instant.
  useEffect(() => {
    renderedAt.current = Date.now();
  }, []);

  const onSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (state === "submitting") return;

      if (!consent) {
        setState("error");
        setMessage(tk("news.err.consent_required"));
        inputRef.current?.focus();
        return;
      }

      setState("submitting");
      setMessage("");
      try {
        const res = await subscribeNewsletterFn({
          data: {
            email,
            locale: lang === "bn" ? "bn" : "en",
            source,
            consent: true,
            honeypot,
            renderedAt: renderedAt.current,
          },
        });

        if (res.outcome === "check_inbox") {
          setState("done");
          setMessage(tk("news.check_inbox"));
          setEmail("");
          setConsent(false);
          return;
        }
        if (res.outcome === "rate_limited") {
          setState("error");
          setMessage(tk("news.rate_limited"));
          return;
        }
        setState("error");
        setMessage(tk(`news.err.${res.reason ?? "generic"}`));
        inputRef.current?.focus();
      } catch {
        // Never surface a server error string to a visitor: it is either
        // useless to them or useful to an attacker.
        setState("error");
        setMessage(tk("news.err.generic"));
      }
    },
    [consent, email, honeypot, lang, source, state, tk],
  );

  const inline = variant === "inline";

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className={`${className} ${inline ? "" : "space-y-3"}`}
      aria-describedby={statusId}
    >
      <div className={inline ? "flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end gap-2" : "space-y-2"}>
        <div className="min-w-0 flex-1">
          <label htmlFor={inputId} className="block text-sm font-medium">
            {tk("news.email_label")}
          </label>
          <input
            id={inputId}
            ref={inputRef}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={tk("news.email_placeholder")}
            aria-invalid={state === "error"}
            className="mt-1 h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm"
          />
        </div>

        {/* Honeypot: off-screen, never focusable, never announced. */}
        <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
          <label htmlFor={`${inputId}-company`}>Company</label>
          <input
            id={`${inputId}-company`}
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={state === "submitting"}
          className="h-11 w-full sm:w-auto shrink-0 rounded-fq-md bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60 inline-flex items-center justify-center"
        >
          {state === "submitting" ? tk("news.submitting") : tk("news.submit")}
        </button>
      </div>

      {/* WCAG 2.5.8: the consent control itself must clear 24px in both axes.
          A 20px box passes visual review and fails a thumb on a 320px phone. */}
      <div className="flex items-start gap-3">
        <input
          id={consentId}
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-2.5 h-6 w-6 shrink-0 accent-primary"
        />
        <label htmlFor={consentId} className="flex min-h-11 items-center text-xs text-muted-foreground">
          {tk("news.consent")}
        </label>
      </div>

      <p className="text-xs text-muted-foreground">
        {tk("news.privacy_note")}{" "}
        <Link to="/legal/$doc" params={{ doc: "privacy" }} className="underline underline-offset-2">
          {lang === "bn" ? "প্রাইভেসি নীতি" : "Privacy policy"}
        </Link>
      </p>

      <p
        id={statusId}
        role="status"
        aria-live="polite"
        className={`text-sm ${state === "error" ? "text-destructive" : "text-muted-foreground"}`}
      >
        {message}
      </p>
    </form>
  );
}

/**
 * Footer/blog block: the form with its heading and promise, so a placement is
 * one import rather than a copy of the surrounding copy.
 */
export function NewsletterBlock({
  source = "footer",
  className = "",
}: {
  source?: NewsletterSource;
  className?: string;
}) {
  const { tk } = useLang();
  return (
    <section className={`rounded-fq-lg border border-border bg-card p-6 ${className}`} aria-labelledby={`nl-${source}`}>
      <h2 id={`nl-${source}`} className="font-bangla-display text-lg font-semibold">
        {tk("news.title")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{tk("news.subtitle")}</p>
      <NewsletterForm source={source} className="mt-4" />
    </section>
  );
}