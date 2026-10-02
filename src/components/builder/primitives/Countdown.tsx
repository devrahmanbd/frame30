import { useEffect, useState } from "react";
import type { Locale } from "@/lib/bitext";

/**
 * Shared sale countdown. Ticks every second, collapses to a static end-time
 * under `prefers-reduced-motion`, renders nothing for an unparseable date.
 * Used by the deal-bound `countdown` widget and any rail with an `endsAt`.
 */
export function Countdown({
  endsAt,
  label,
  locale = "en",
}: {
  endsAt: string;
  label: string;
  locale?: Locale;
}) {
  const [left, setLeft] = useState<number>(
    () => Date.parse(endsAt) - Date.now(),
  );
  // Reduced motion gets the end time as text instead of a ticking clock.
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(
      () => setLeft(Date.parse(endsAt) - Date.now()),
      1000,
    );
    return () => clearInterval(id);
  }, [endsAt, reduced]);
  if (!Number.isFinite(left)) return null;
  const clamped = Math.max(0, left);
  if (reduced) {
    const ends = new Date(Date.parse(endsAt));
    return (
      <p className="rounded-fq-md border border-border bg-card px-4 py-2 text-sm">
        <span className="font-medium">{label}</span>{" "}
        <time dateTime={ends.toISOString()}>
          {ends.toLocaleString(locale === "bn" ? "bn-BD" : "en-GB")}
        </time>
      </p>
    );
  }
  const parts = [
    Math.floor(clamped / 86_400_000),
    Math.floor(clamped / 3_600_000) % 24,
    Math.floor(clamped / 60_000) % 60,
    Math.floor(clamped / 1000) % 60,
  ];
  return (
    <p className="rounded-fq-md border border-border bg-card px-4 py-2 text-sm tabular-nums">
      <span className="font-medium">{label}</span>{" "}
      <span aria-live="off">
        {parts.map((p) => String(p).padStart(2, "0")).join(":")}
      </span>
    </p>
  );
}
