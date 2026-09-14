import { useEffect } from "react";
import { trackEvent, type TrackEntity } from "@/lib/traffic-client";

/**
 * Records one funnel step for the page it is mounted on (product view,
 * checkout start, search). Renders nothing; safe on the server, where the
 * effect never runs.
 */
export function TrackView({
  entity,
  action = "view",
  detail,
}: {
  entity: TrackEntity;
  action?: string;
  detail?: Record<string, string | number | boolean>;
}) {
  const key = JSON.stringify(detail ?? {});
  useEffect(() => {
    trackEvent({ entity, action, payload: detail });
    // `key` stands in for `detail` so a new product or query counts once.
  }, [entity, action, key]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
