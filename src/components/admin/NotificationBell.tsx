import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, AlertTriangle, AlertOctagon, Info } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { adminNotificationsFn, adminMarkNotificationsFn } from "@/lib/merchant-admin.functions";

const TONE = {
  info: { icon: Info, cls: "text-info-foreground bg-info-soft" },
  warning: { icon: AlertTriangle, cls: "text-warning-foreground bg-warning-soft" },
  critical: { icon: AlertOctagon, cls: "text-danger-foreground bg-danger-soft" },
} as const;

export function NotificationBell() {
  const { t, lang } = useLang();
  const fetchFeed = useServerFn(adminNotificationsFn);
  const markRead = useServerFn(adminMarkNotificationsFn);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const { data, isError } = useQuery({
    queryKey: ["admin", "notifications"],
    queryFn: () => fetchFeed(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = data?.unread ?? 0;
  const items = data?.items ?? [];

  async function clearAll() {
    await markRead({ data: { ids: null } });
    await qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
  }

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          unread > 0
            ? t(`Alerts, ${unread} unread`, `অ্যালার্ট, ${unread} টি অপঠিত`)
            : t("Alerts", "অ্যালার্ট")
        }
        className="relative grid size-9 place-items-center rounded-fq-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Bell className="size-4" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("Alerts", "অ্যালার্ট")}
          className="absolute right-0 top-11 z-20 w-80 overflow-hidden rounded-fq-md border border-border bg-card shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <h2 className="text-sm font-semibold">{t("Alerts", "অ্যালার্ট")}</h2>
            <button
              type="button"
              onClick={clearAll}
              disabled={unread === 0}
              className="rounded-fq-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              {t("Mark all read", "সব পঠিত")}
            </button>
          </div>

          <ul className="max-h-96 divide-y divide-border overflow-y-auto">
            {isError && (
              <li role="alert" className="px-3 py-4 text-sm text-danger-foreground">
                {t("Alerts unavailable right now", "এই মুহূর্তে অ্যালার্ট পাওয়া যাচ্ছে না")}
              </li>
            )}
            {!isError && items.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t("No alerts. You are all caught up.", "কোনো অ্যালার্ট নেই।")}
              </li>
            )}
            {items.map((n) => {
              const tone = TONE[n.severity] ?? TONE.info;
              const Icon = tone.icon;
              const title = lang === "bn" ? n.titleBn || n.titleEn : n.titleEn;
              const body = lang === "bn" ? n.bodyBn || n.bodyEn : n.bodyEn;
              const inner = (
                <div className="flex gap-2.5">
                  <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${tone.cls}`}>
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className={`truncate text-sm ${n.read ? "" : "font-semibold"}`}>{title}</p>
                    {body && <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>}
                    <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                      {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
              return (
                <li key={n.id} className={n.read ? "" : "bg-muted/40"}>
                  {n.href ? (
                    <a
                      href={n.href}
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2.5 hover:bg-muted"
                    >
                      {inner}
                    </a>
                  ) : (

                    <div className="px-3 py-2.5">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="border-t border-border px-3 py-2 text-right">
            <Link
              to="/admin/activity"
              onClick={() => setOpen(false)}
              className="text-xs text-primary underline-offset-2 hover:underline"
            >
              {t("View activity log", "অ্যাক্টিভিটি লগ দেখুন")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
