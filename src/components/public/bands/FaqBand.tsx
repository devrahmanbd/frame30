/**
 * FaqBand — native `<details>` rows on canvas.
 *
 * No JS accordion: `<details>` opens before hydration, is keyboard operable for
 * free, prints correctly and is readable by a crawler with the answer text in
 * the DOM. If the route also emits FAQPage JSON-LD, the entries must match
 * these rows verbatim — mismatched structured data is a spam signal, so the
 * caller passes the same array to both.
 */
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/public/motion";

export type FaqEntry = {
  id: string;
  question: ReactNode;
  answer: ReactNode;
};

export type FaqBandProps = {
  entries: FaqEntry[];
  className?: string;
};

export function FaqBand({ entries, className }: FaqBandProps) {
  return (
    <div className={cn("mt-10 divide-y divide-border border-y border-border", className)}>
      {entries.map((entry) => (
        <Reveal key={entry.id} as="div">
          <details className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-base font-medium">
              <span>{entry.question}</span>
              <span
                aria-hidden="true"
                className="text-muted-foreground transition-transform duration-300 ease-out group-open:rotate-180 shrink-0"
              >
                <ChevronDown className="size-4" />
              </span>
            </summary>
            <div
              data-type-role="body"
              className="fq-measure mt-3 leading-[1.6] text-muted-foreground"
            >
              {entry.answer}
            </div>
          </details>
        </Reveal>
      ))}
    </div>
  );
}
