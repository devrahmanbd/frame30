import { Fragment, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import {
  snapshotCreateFn,
  snapshotDeleteFn,
  snapshotDeskFn,
  snapshotDownloadFn,
  snapshotRestoreFn,
  snapshotVerifyFn,
} from "@/lib/snapshots.functions";
import { confirmPhrase, SNAPSHOT_TABLES } from "@/lib/snapshots";
import { OwnerHeader, OwnerTable, StatCard, StatGrid, StatePill } from "@/components/root/OwnerUi";

export const Route = createFileRoute("/root/snapshots")({
  head: () => ({
    meta: [
      { title: "Time machine — Framique owner console" },
      {
        name: "description",
        content:
          "Take a compressed snapshot of the whole Framique platform or a single store, verify it against the live database, download it, and rewind rows back into place.",
      },
      { property: "og:title", content: "Time machine — Framique owner console" },
      {
        property: "og:description",
        content: "Compressed platform snapshots with verification, download and a guarded rewind.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SnapshotDesk,
});

const btn =
  "rounded-fq-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50";
const primary =
  "rounded-fq-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50";
const field = "rounded-fq-md border border-border bg-background px-3 py-2 text-sm";

function tone(status: string): "ok" | "warn" | "bad" {
  if (status === "damaged" || status === "failed") return "bad";
  if (status === "running") return "warn";
  return "ok";
}

function SnapshotDesk() {
  const { t } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(snapshotDeskFn);
  const create = useServerFn(snapshotCreateFn);
  const download = useServerFn(snapshotDownloadFn);
  const verify = useServerFn(snapshotVerifyFn);
  const restore = useServerFn(snapshotRestoreFn);
  const remove = useServerFn(snapshotDeleteFn);

  const [scope, setScope] = useState<"platform" | "store">("platform");
  const [merchantId, setMerchantId] = useState("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const desk = useQuery({ queryKey: ["owner", "snapshots"], queryFn: () => load() });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["owner", "snapshots"] });
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e));

  const capture = useMutation({
    mutationFn: () =>
      create({
        data: {
          scope,
          merchantId: scope === "store" ? merchantId || null : null,
          label: label || null,
          note: note || null,
        },
      }),
    onSuccess: (r) => {
      toast.success(
        t(
          `Snapshot taken — ${r.rowCount} rows, ${r.sizeLabel} compressed.`,
          `স্ন্যাপশট নেওয়া হয়েছে — ${r.rowCount} সারি, ${r.sizeLabel}।`,
        ),
      );
      setLabel("");
      setNote("");
      refresh();
    },
    onError: fail,
  });

  const act = useMutation({
    mutationFn: async (input: { kind: "verify" | "download" | "delete" | "dry_run" | "restore"; id: string }) => {
      if (input.kind === "verify") return { kind: input.kind, data: await verify({ data: { id: input.id } }) };
      if (input.kind === "download") return { kind: input.kind, data: await download({ data: { id: input.id } }) };
      if (input.kind === "delete") return { kind: input.kind, data: await remove({ data: { id: input.id } }) };
      return {
        kind: input.kind,
        data: await restore({
          data: { id: input.id, mode: input.kind === "restore" ? "restore" : "dry_run", confirm: confirmText },
        }),
      };
    },
    onSuccess: (out) => {
      if (out.kind === "download") {
        const url = (out.data as { url: string }).url;
        window.open(url, "_blank", "noopener,noreferrer");
        toast.success(t("Download link opened — it expires in 15 minutes.", "ডাউনলোড লিংক খোলা হয়েছে — ১৫ মিনিটে শেষ হবে।"));
        return;
      }
      if (out.kind === "verify") {
        const v = out.data as { status: string };
        toast.success(t(`Checked: ${v.status}.`, `যাচাই: ${v.status}।`));
      }
      if (out.kind === "dry_run") {
        const r = out.data as { results: { table: string; rows: number }[] };
        const rows = r.results.reduce((s, x) => s + x.rows, 0);
        toast.success(t(`Rehearsal: ${rows} rows would be written back.`, `রিহার্সাল: ${rows} সারি ফেরানো হবে।`));
      }
      if (out.kind === "restore") {
        const r = out.data as { rowsWritten: number };
        toast.success(t(`Rewound ${r.rowsWritten} rows.`, `${r.rowsWritten} সারি ফেরানো হয়েছে।`));
        setConfirmText("");
      }
      if (out.kind === "delete") toast.success(t("Snapshot removed.", "স্ন্যাপশট মুছে ফেলা হয়েছে।"));
      refresh();
    },
    onError: fail,
  });

  const data = desk.data;
  const busy = capture.isPending || act.isPending;

  return (
    <div className="space-y-6">
      <OwnerHeader
        title={t("Time machine", "টাইম মেশিন")}
        subtitle={t(
          "One compressed archive of the whole system — stores, catalogue, orders, money, content, design and the audit trail. Check it against the live database, download it, or rewind rows back into place.",
          "পুরো সিস্টেমের একটি সংকুচিত আর্কাইভ — দোকান, ক্যাটালগ, অর্ডার, টাকা, কনটেন্ট, ডিজাইন ও অডিট ট্রেইল। লাইভ ডেটার সাথে মিলিয়ে দেখুন, ডাউনলোড করুন, বা সারি ফিরিয়ে আনুন।",
        )}
      />

      <StatGrid>
        <StatCard label={t("Snapshots kept", "সংরক্ষিত স্ন্যাপশট")} value={String(data?.totals.count ?? 0)} />
        <StatCard label={t("Archive size", "আর্কাইভের আকার")} value={data?.totals.sizeLabel ?? "—"} />
        <StatCard label={t("Rows captured", "ধরা সারি")} value={String(data?.totals.rows ?? 0)} />
        <StatCard label={t("Tables covered", "টেবিল")} value={String(SNAPSHOT_TABLES.length)} />
      </StatGrid>

      <section className="space-y-3 rounded-fq-md border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">{t("Take a snapshot", "স্ন্যাপশট নিন")}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs">
            <span className="block text-muted-foreground">{t("Covers", "পরিসর")}</span>
            <select
              className={field}
              value={scope}
              onChange={(e) => setScope(e.target.value as "platform" | "store")}
            >
              <option value="platform">{t("Whole platform", "পুরো প্ল্যাটফর্ম")}</option>
              <option value="store">{t("One store", "একটি দোকান")}</option>
            </select>
          </label>
          {scope === "store" && (
            <label className="space-y-1 text-xs">
              <span className="block text-muted-foreground">{t("Store", "দোকান")}</span>
              <select className={field} value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>
                <option value="">{t("Pick a store", "দোকান বাছুন")}</option>
                {(data?.stores ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="space-y-1 text-xs">
            <span className="block text-muted-foreground">{t("Name", "নাম")}</span>
            <input
              className={field}
              value={label}
              placeholder={t("Before the September release", "সেপ্টেম্বর রিলিজের আগে")}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="block text-muted-foreground">{t("Why", "কারণ")}</span>
            <input className={field} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button
            type="button"
            className={primary}
            disabled={busy || (scope === "store" && !merchantId)}
            onClick={() => capture.mutate()}
          >
            {capture.isPending ? t("Taking…", "নেওয়া হচ্ছে…") : t("Take snapshot", "স্ন্যাপশট নিন")}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            "Payment credentials are blanked out before the archive is written, and are never put back by a rewind. A rewind adds and updates rows only — nothing is deleted.",
            "আর্কাইভে পেমেন্ট ক্রেডেনশিয়াল রাখা হয় না, ফেরানোর সময়ও বসানো হয় না। ফেরানো মানে সারি যোগ ও হালনাগাদ — কিছু মুছে যায় না।",
          )}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t("Snapshot history", "স্ন্যাপশটের ইতিহাস")}</h2>
        {desk.isLoading && <p className="text-sm text-muted-foreground">{t("Loading…", "লোড হচ্ছে…")}</p>}
        {desk.error && (
          <p className="text-sm text-destructive">
            {desk.error instanceof Error ? desk.error.message : String(desk.error)}
          </p>
        )}
        <OwnerTable
          head={[
            t("Snapshot", "স্ন্যাপশট"),
            t("Covers", "পরিসর"),
            t("Rows", "সারি"),
            t("Size", "আকার"),
            t("Fingerprint", "ফিঙ্গারপ্রিন্ট"),
            t("State", "অবস্থা"),
            "",
          ]}
        >
          {(data?.snapshots ?? []).map((s) => (
            <Fragment key={s.id}>
              <tr className="border-t border-border align-top">
                <td className="p-2">
                  <p className="font-medium">{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.takenAt.replace("T", " ").slice(0, 16)}</p>
                  {s.note && <p className="text-xs text-muted-foreground">{s.note}</p>}
                </td>
                <td className="p-2 text-xs">
                  {s.scope === "platform" ? t("Whole platform", "পুরো প্ল্যাটফর্ম") : t("One store", "একটি দোকান")}
                  <span className="block text-muted-foreground">
                    {s.tableCount} {t("tables", "টেবিল")}
                  </span>
                </td>
                <td className="p-2 text-xs">{s.rowCount}</td>
                <td className="p-2 text-xs">{s.sizeLabel}</td>
                <td className="p-2 font-mono text-xs">{s.checksum ?? "—"}</td>
                <td className="p-2">
                  <StatePill tone={tone(s.status)}>{s.status}</StatePill>
                  {s.failure && <p className="mt-1 text-xs text-destructive">{s.failure}</p>}
                </td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={btn}
                      disabled={busy}
                      onClick={() => act.mutate({ kind: "verify", id: s.id })}
                    >
                      {t("Check", "যাচাই")}
                    </button>
                    <button
                      type="button"
                      className={btn}
                      disabled={busy}
                      onClick={() => act.mutate({ kind: "download", id: s.id })}
                    >
                      {t("Download", "ডাউনলোড")}
                    </button>
                    <button
                      type="button"
                      className={btn}
                      disabled={busy}
                      onClick={() => {
                        setOpenId(openId === s.id ? null : s.id);
                        setConfirmText("");
                      }}
                    >
                      {t("Rewind…", "ফেরান…")}
                    </button>
                    <button
                      type="button"
                      className={btn}
                      disabled={busy}
                      onClick={() => act.mutate({ kind: "delete", id: s.id })}
                    >
                      {t("Delete", "মুছুন")}
                    </button>
                  </div>
                </td>
              </tr>
              {openId === s.id && (
                <tr className="border-t border-border bg-muted/40">
                  <td className="p-3" colSpan={7}>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "Rehearse first: it reports what would be written without touching anything. To rewind for real, type the phrase below.",
                        "আগে রিহার্সাল করুন: কিছু না বদলে দেখাবে কী ফেরানো হবে। সত্যিই ফেরাতে নিচের বাক্যটি লিখুন।",
                      )}
                    </p>
                    <p className="mt-1 font-mono text-xs">{confirmPhrase(s.label)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        className={field}
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder={confirmPhrase(s.label)}
                      />
                      <button
                        type="button"
                        className={btn}
                        disabled={busy}
                        onClick={() => act.mutate({ kind: "dry_run", id: s.id })}
                      >
                        {t("Rehearse", "রিহার্সাল")}
                      </button>
                      <button
                        type="button"
                        className={primary}
                        disabled={busy || confirmText.trim().toLowerCase() !== confirmPhrase(s.label)}
                        onClick={() => act.mutate({ kind: "restore", id: s.id })}
                      >
                        {t("Rewind now", "এখন ফেরান")}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </OwnerTable>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t("Rewind history", "ফেরানোর ইতিহাস")}</h2>
        <OwnerTable
          head={[
            t("When", "কখন"),
            t("Kind", "ধরন"),
            t("State", "অবস্থা"),
            t("Rows written", "লেখা সারি"),
            t("Tables", "টেবিল"),
          ]}
        >
          {(data?.restores ?? []).map((r) => (
            <tr key={r.id} className="border-t border-border align-top">
              <td className="p-2 text-xs">{r.startedAt.replace("T", " ").slice(0, 16)}</td>
              <td className="p-2 text-xs">
                {r.mode === "restore" ? t("Rewind", "ফেরানো") : t("Rehearsal", "রিহার্সাল")}
              </td>
              <td className="p-2">
                <StatePill tone={r.status === "failed" ? "bad" : r.status === "running" ? "warn" : "ok"}>
                  {r.status}
                </StatePill>
                {r.failure && <p className="mt-1 text-xs text-destructive">{r.failure}</p>}
              </td>
              <td className="p-2 text-xs">{r.rowsWritten}</td>
              <td className="p-2 text-xs">{r.results.length}</td>
            </tr>
          ))}
        </OwnerTable>
      </section>
    </div>
  );
}
