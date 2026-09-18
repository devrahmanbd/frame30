import { useState } from "react";
import { useLang } from "@/lib/i18n";

export type Revision = {
  id: string;
  version: number;
  status: string;
  note: string | null;
  createdAt: string;
  rollbackOf: string | null;
};

export type HistoryPanelProps = {
  actions: { id: string; label: string; timestamp: number }[];
  revisions: Revision[];
  currentRevisionId?: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onRestore?: (revisionId: string) => void;
};

export function HistoryPanel({
  actions,
  revisions,
  currentRevisionId,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onRestore,
}: HistoryPanelProps) {
  const { t } = useLang();
  const [tab, setTab] = useState<"actions" | "revisions">("actions");
  return (
    <div className="space-y-2">
      <div role="tablist" className="flex gap-1">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "actions"}
          onClick={() => setTab("actions")}
          className={`flex-1 rounded-fq-md px-2 py-1.5 text-xs ${tab === "actions" ? "bg-primary text-primary-foreground" : "border border-border"}`}
        >
          {t("Actions", "অ্যাকশন")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "revisions"}
          onClick={() => setTab("revisions")}
          className={`flex-1 rounded-fq-md px-2 py-1.5 text-xs ${tab === "revisions" ? "bg-primary text-primary-foreground" : "border border-border"}`}
        >
          {t("Revisions", "রিভিশন")}
        </button>
      </div>
      {tab === "actions" && (
        <div className="space-y-2">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="flex-1 rounded-fq-md border border-border px-2 py-1.5 text-xs hover:bg-muted disabled:opacity-40"
            >
              {t("Undo", "আনডু")}
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className="flex-1 rounded-fq-md border border-border px-2 py-1.5 text-xs hover:bg-muted disabled:opacity-40"
            >
              {t("Redo", "রিডু")}
            </button>
          </div>
          <ul className="space-y-0.5">
            {actions.length === 0 && (
              <li className="px-2 py-4 text-center text-xs text-muted-foreground">
                {t("No actions yet", "এখনো কোনো অ্যাকশন নেই")}
              </li>
            )}
            {actions.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded-fq-md px-2 py-1.5 text-xs hover:bg-muted"
              >
                <span className="flex-1 truncate">{a.label}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {new Date(a.timestamp).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {tab === "revisions" && (
        <ul className="space-y-0.5">
          {revisions.length === 0 && (
            <li className="px-2 py-4 text-center text-xs text-muted-foreground">
              {t("No saved revisions", "সেভ করা রিভিশন নেই")}
            </li>
          )}
          {revisions.map((rev) => (
            <li
              key={rev.id}
              className={`flex items-center gap-2 rounded-fq-md px-2 py-1.5 text-xs ${rev.id === currentRevisionId ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}
            >
              <span className="flex-1 truncate">
                v{rev.version} — {rev.note || t("Draft", "ড্রাফট")}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {new Date(rev.createdAt).toLocaleDateString()}
              </span>
              {onRestore && rev.id !== currentRevisionId && (
                <button
                  type="button"
                  onClick={() => onRestore(rev.id)}
                  className="shrink-0 underline"
                >
                  {t("Restore", "রিস্টোর")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
