/**
 * Phase 12 — first-visit choice for posts: Classic editor vs Page builder.
 * Two wireframe thumbnails drawn with tokens; the choice is stored in `editor`.
 */
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function EditorChoiceCard({ onChoose }: { onChoose: (editor: "classic" | "builder") => void }) {
  const { t } = useLang();
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-10" role="group" aria-labelledby="editor-choice-title">
      <h2 id="editor-choice-title" className="font-bangla-display text-2xl font-bold">
        {t("How do you want to write this post?", "এই পোস্টটি কীভাবে লিখতে চান?")}
      </h2>
      <p className="fq-sub mt-1 text-sm">{t("You can switch later from the toolbar. We'll remember your choice for this post.", "পরে টুলবার থেকে বদলাতে পারবেন। এই পোস্টের জন্য পছন্দ মনে রাখা হবে।")}</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Choice
          title={t("Classic editor", "ক্লাসিক এডিটর")}
          hint={t("A focused writing column with a familiar formatting toolbar.", "পরিচিত টুলবারসহ মনোযোগী লেখার কলাম।")}
          onClick={() => onChoose("classic")}
        >
          <div className="space-y-1.5 p-3">
            <div className="h-2 w-2/3 rounded bg-foreground/70" />
            <div className="flex gap-1">
              {[6, 6, 6, 6, 10, 6, 6].map((w, i) => (
                <span key={i} className="h-2 rounded bg-primary/60" style={{ width: w }} />
              ))}
            </div>
            <div className="h-1.5 w-full rounded bg-muted-foreground/40" />
            <div className="h-1.5 w-11/12 rounded bg-muted-foreground/40" />
            <div className="h-1.5 w-4/5 rounded bg-muted-foreground/40" />
            <div className="h-1.5 w-full rounded bg-muted-foreground/40" />
            <div className="h-1.5 w-2/3 rounded bg-muted-foreground/40" />
          </div>
        </Choice>
        <Choice
          title={t("Page builder", "পেজ বিল্ডার")}
          hint={t("Sections, columns and widgets with drag-and-drop layout.", "ড্র্যাগ-এন্ড-ড্রপ সেকশন, কলাম ও উইজেট।")}
          onClick={() => onChoose("builder")}
        >
          <div className="grid grid-cols-[28px_1fr] gap-1.5 p-2">
            <div className="space-y-1">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="aspect-square rounded bg-muted-foreground/40" />
              ))}
            </div>
            <div className="space-y-1.5">
              <div className="h-8 rounded border border-dashed border-primary/70 bg-primary/10" />
              <div className="grid grid-cols-3 gap-1">
                <div className="h-6 rounded bg-muted-foreground/40" />
                <div className="h-6 rounded bg-muted-foreground/40" />
                <div className="h-6 rounded bg-muted-foreground/40" />
              </div>
              <div className="h-5 rounded bg-muted-foreground/30" />
            </div>
          </div>
        </Choice>
      </div>
    </div>
  );
}

function Choice({ title, hint, onClick, children }: { title: string; hint: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "fq-focus-glow group flex flex-col overflow-hidden rounded-fq-lg border border-border bg-card text-left transition-[border-color,transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:border-primary hover:shadow-[0_18px_40px_-28px_var(--fq-signal)]",
      )}
    >
      <div className="aspect-[16/9] w-full border-b border-border bg-muted/50" aria-hidden>
        {children}
      </div>
      <div className="p-4">
        <span className="block text-sm font-semibold group-hover:text-primary">{title}</span>
        <span className="fq-sub mt-0.5 block text-xs">{hint}</span>
      </div>
    </button>
  );
}
