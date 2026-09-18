import { useState } from "react";
import { useLang } from "@/lib/i18n";

export function MaintenanceSettings() {
  const { t } = useLang();
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<"503" | "200">("503");
  const [message, setMessage] = useState("We'll be back soon!");
  const [excludes, setExcludes] = useState<Record<string, boolean>>({
    admin: true,
    editor: false,
    viewer: false,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">
          {t("Maintenance mode", "মেইনটেন্যান্স মোড")}
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted"}`}
        >
          <span
            className={`inline-block size-4 rounded-full bg-white transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`}
          />
        </button>
      </div>

      {enabled && (
        <>
          <div className="space-y-1">
            <label className="text-xs font-medium">{t("Mode", "মোড")}</label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setMode("503")}
                className={`flex-1 rounded-fq-md px-2 py-1.5 text-xs ${mode === "503" ? "bg-primary text-primary-foreground" : "border border-border"}`}
              >
                503 {t("Maintenance", "মেইনটেন্যান্স")}
              </button>
              <button
                type="button"
                onClick={() => setMode("200")}
                className={`flex-1 rounded-fq-md px-2 py-1.5 text-xs ${mode === "200" ? "bg-primary text-primary-foreground" : "border border-border"}`}
              >
                200 {t("Coming Soon", "শীঘ্রই আসছে")}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">
              {t("Message", "বার্তা")}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full rounded-fq-md border border-border bg-card px-2 py-1.5 text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">
              {t("Excluded roles", "বাদ দেওয়া ভূমিকা")}
            </label>
            {Object.keys(excludes).map((role) => (
              <label key={role} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={excludes[role]}
                  onChange={(e) =>
                    setExcludes({ ...excludes, [role]: e.target.checked })
                  }
                  className="size-3"
                />
                {role}
              </label>
            ))}
          </div>

          <div className="rounded-fq-md border border-border p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">
              {t("Preview", "প্রিভিউ")}
            </p>
            <p className="mt-1">
              {mode === "503"
                ? `HTTP 503 — ${message}`
                : `HTTP 200 — ${message}`}
            </p>
            <p className="mt-1 text-[10px]">
              {t("Visible to:", "দেখা যাবে:")}{" "}
              {Object.entries(excludes)
                .filter(([, v]) => !v)
                .map(([k]) => k)
                .join(", ") || t("everyone", "সবাই")}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
