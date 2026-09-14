/**
 * Phase 1.3 — the consent chip.
 *
 * Any widget that captures contact details (newsletter, back-in-stock, quiz
 * results by email) must render this next to its submit control. Keeping it a
 * shared primitive means the marketing-consent wording can never be edited
 * away per-widget, and lint can require it.
 */
import { textOf, type Locale } from "@/lib/bitext";

export function ConsentChip({
  props,
  locale,
  field = "consentText",
}: {
  props: Record<string, unknown>;
  locale: Locale;
  field?: string;
}) {
  const text = textOf(props, field, locale);
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      {text ||
        (locale === "bn"
          ? "সাবমিট করলে আপনি আমাদের প্রাইভেসি নীতিতে সম্মত হচ্ছেন।"
          : "By submitting you agree to our privacy policy.")}
    </p>
  );
}
