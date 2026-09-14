import { useEffect } from "react";
import { startVitalsReporter } from "@/lib/vitals-client";

/**
 * Phase 4.4 — mounts the field-data collector for one storefront page view.
 *
 * Renders nothing and never suspends. The collector itself is imported
 * statically but does nothing on the server (it bails when `window` is
 * undefined), and the effect is keyed on the template so a client-side route
 * change ends one page view and starts the next.
 */
export function VitalsReporter({
  merchantId,
  template,
  locale = "en",
  sampleRate = 1,
}: {
  merchantId: string | null | undefined;
  template: string;
  locale?: "en" | "bn";
  sampleRate?: number;
}) {
  useEffect(() => {
    if (!merchantId) return;
    return startVitalsReporter({ merchantId, template, locale, sampleRate });
  }, [merchantId, template, locale, sampleRate]);

  return null;
}
