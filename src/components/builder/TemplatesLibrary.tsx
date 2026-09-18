import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { listBlocks, deleteBlock, importBlocks, type SavedBlock } from "@/lib/saved-blocks";
import type { Section } from "@/lib/builder-ast";

export type TemplatesLibraryProps = {
  themeId: string;
  onInsert: (nodes: Section[]) => void;
};

export function TemplatesLibrary({ themeId, onInsert }: TemplatesLibraryProps) {
  const { t } = useLang();
  const [filter, setFilter] = useState("");
  const [typeTab, setTypeTab] = useState<"all" | "sections" | "widgets">("all");
  const [blocks, setBlocks] = useState<SavedBlock[]>(() => listBlocks(themeId));

  const filtered = useMemo(() => {
    return blocks.filter((b) => {
      const matchesFilter = !filter || b.name.toLowerCase().includes(filter.toLowerCase());
      const matchesType = typeTab === "all" || (typeTab === "sections" && b.nodes.length > 1) || (typeTab === "widgets" && b.nodes.length === 1);
      return matchesFilter && matchesType;
    });
  }, [blocks, filter, typeTab]);

  return (
    <div className="space-y-3">
      <div role="tablist" className="flex gap-1">
        {(["all", "sections", "widgets"] as const).map((tab) => (
          <button key={tab} type="button" role="tab" aria-selected={typeTab === tab} onClick={() => setTypeTab(tab)} className={`flex-1 rounded-fq-md px-2 py-1.5 text-xs ${typeTab === tab ? "bg-primary text-primary-foreground" : "border border-border"}`}>
            {tab === "all" ? "সব" : tab === "sections" ? "সেকশন" : "উইজেট"}
          </button>
        ))}
      </div>

      <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("Search templates…", "টেমপ্লেট খুঁজুন…")} className="w-full rounded-fq-md border border-border bg-card px-2 py-1.5 text-xs" />

      <div className="flex gap-1">
        <label className="cursor-pointer rounded-fq-md border border-border px-2 py-1.5 text-xs hover:bg-muted">
          {t("Import", "ইমপোর্ট")}
          <input type="file" accept="application/json" className="sr-only" onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const result = importBlocks(themeId, await file.text());
            setBlocks(listBlocks(themeId));
            if (result.added > 0) toast.success(`${result.added} template(s) imported`);
          }} />
        </label>
      </div>

      <ul className="space-y-0.5">
        {filtered.length === 0 && <li className="px-2 py-4 text-center text-xs text-muted-foreground">{t("No templates saved yet.", "এখনো কোনো টেমপ্লেট সেভ হয়নি।")}</li>}
        {filtered.map((block) => (
          <li key={block.id} className="flex items-center gap-1 rounded-fq-md px-2 py-1.5 text-xs hover:bg-muted">
            <button type="button" onClick={() => onInsert(block.nodes)} className="min-w-0 flex-1 truncate text-left">{block.name}</button>
            <span className="shrink-0 text-[10px] text-muted-foreground">{block.nodes.length}n</span>
            <button type="button" aria-label={t("Delete", "মুছুন")} onClick={() => { deleteBlock(themeId, block.id); setBlocks(listBlocks(themeId)); }} className="shrink-0 inline-flex size-6 items-center justify-center rounded hover:bg-destructive/10">×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
