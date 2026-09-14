import { useEffect } from "react";
import { startTrafficReporter } from "@/lib/traffic-client";

/**
 * Mounts the storefront traffic collector for one page view. Renders nothing,
 * does nothing on the server, and restarts on a client-side route change so a
 * new template counts as a new page view.
 */
export function TrafficReporter({
  merchantId,
  template,
  sampleRate = 1,
}: {
  merchantId: string | null | undefined;
  template: string;
  sampleRate?: number;
}) {
  useEffect(() => {
    if (!merchantId) return;
    return startTrafficReporter({ merchantId, template, sampleRate });
  }, [merchantId, template, sampleRate]);

  return null;
}
