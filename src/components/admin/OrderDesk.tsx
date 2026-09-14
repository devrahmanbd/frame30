/**
 * Order desk: line-level refunds with a per-line restock choice, COD
 * confirm-by-call outcomes, and internal notes / tags. Every action is a
 * server function — the UI only chooses, the server decides.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";
import {
  addOrderNote,
  deleteOrderNote,
  loadOrderDesk,
  recordCodCall,
  refundOrderLines,
  setOrderTags,
} from "@/lib/orders-admin.functions";

type Item = {
  id: string;
  product_title: string;
  variant_name: string | null;
  quantity: number;
  unit_price_minor_int: number;
};

const REFUND_REASONS: [string, string, string][] = [
  ["damaged", "Damaged", "ক্ষতিগ্রস্ত"],
  ["wrong_item", "Wrong item", "ভুল পণ্য"],
  ["not_as_described", "Not as described", "বর্ণনার সাথে মেলেনি"],
  ["late_delivery", "Late delivery", "দেরিতে ডেলিভারি"],
  ["customer_changed_mind", "Changed mind", "মত বদলেছে"],
  ["price_adjustment", "Price adjustment", "দাম সমন্বয়"],
  ["duplicate_charge", "Duplicate charge", "দ্বিগুণ চার্জ"],
  ["other", "Other", "অন্যান্য"],
];

const COD_OUTCOMES: [string, string, string][] = [
  ["confirmed", "Confirmed", "নিশ্চিত"],
  ["no_answer", "No answer", "ধরেনি"],
  ["wrong_number", "Wrong number", "ভুল নম্বর"],
  ["refused", "Refused", "প্রত্যাখ্যান"],
  ["callback_requested", "Callback requested", "পরে কল করতে বলেছে"],
];

const card = "rounded-fq-lg border border-border bg-card p-4";
const input =
  "min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const primary =
  "min-h-11 rounded-fq-md bg-bd-teal-700 px-4 text-sm font-medium text-background disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const ghost =
  "min-h-9 rounded-fq-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function OrderDesk({
  orderId,
  items,
  currency,
  paymentMethod,
  tags,
  closed,
}: {
  orderId: string;
  items: Item[];
  currency: string;
  paymentMethod: string;
  tags: string[];
  closed: boolean;
}) {
  const { t } = useLang();
  const qc = useQueryClient();
  const deskKey = ["admin-order-desk", orderId];
  const load = useServerFn(loadOrderDesk);
  const refundLines = useServerFn(refundOrderLines);
  const codCall = useServerFn(recordCodCall);
  const noteAdd = useServerFn(addOrderNote);
  const noteDelete = useServerFn(deleteOrderNote);
  const tagsSave = useServerFn(setOrderTags);

  const { data } = useQuery({ queryKey: deskKey, queryFn: () => load({ data: { orderId } }) });

  const refundedByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of data?.refundLines ?? []) {
      map.set(l.order_item_id, (map.get(l.order_item_id) ?? 0) + Number(l.quantity));
    }
    return map;
  }, [data]);

  const [qty, setQty] = useState<Record<string, number>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("damaged");
  const [refundNote, setRefundNote] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: deskKey });
    void qc.invalidateQueries({ queryKey: ["admin-order", orderId] });
  };

  const selected = items
    .map((i) => ({ item: i, q: qty[i.id] ?? 0 }))
    .filter((s) => s.q > 0);
  const selectedTotal = selected.reduce((s, x) => s + x.q * Number(x.item.unit_price_minor_int), 0);

  const refundMutation = useMutation({
    mutationFn: () =>
      refundLines({
        data: {
          orderId,
          lines: selected.map((s) => ({
            orderItemId: s.item.id,
            quantity: s.q,
            restock: restock[s.item.id] ?? true,
          })),
          reason: reason as "damaged",
          note: refundNote || undefined,
        },
      }),
    onSuccess: (r) => {
      toast.success(
        r.replayed
          ? t("That refund was already issued", "এই রিফান্ড আগেই হয়েছে")
          : `${t("Refunded", "রিফান্ড হয়েছে")} ${fmtMinor(r.amountMinor, currency)}`,
      );
      setQty({});
      setRefundNote("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const callMutation = useMutation({
    mutationFn: (outcome: string) =>
      codCall({ data: { orderId, outcome: outcome as "confirmed", note: noteDraft || undefined } }),
    onSuccess: (r) => {
      toast.success(`${t("Call logged", "কল লেখা হয়েছে")} · ${r.orderStatus}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addNote = useMutation({
    mutationFn: (body: string) => noteAdd({ data: { orderId, body } }),
    onSuccess: () => {
      setNoteDraft("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeNote = useMutation({
    mutationFn: (noteId: string) => noteDelete({ data: { noteId } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const saveTags = useMutation({
    mutationFn: (next: string[]) => tagsSave({ data: { orderId, tags: next } }),
    onSuccess: () => {
      setTagDraft("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isCod = paymentMethod === "cod";
  const calls = data?.calls ?? [];

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      {/* ---------------------------- line-level refund ---------------------------- */}
      <section className={`${card} lg:col-span-2`}>
        <h2 className="text-sm font-semibold">{t("Refund lines", "লাইন রিফান্ড")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            "Choose the units to refund and whether each one comes back into stock. A damaged unit returns money but not stock.",
            "কোন ইউনিট রিফান্ড হবে এবং সেটি স্টকে ফিরবে কিনা বেছে নিন। ক্ষতিগ্রস্ত পণ্য টাকা ফেরত দেয়, স্টক নয়।",
          )}
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Refundable order lines</caption>
            <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="p-2">{t("Item", "পণ্য")}</th>
                <th scope="col" className="p-2">{t("Refundable", "রিফান্ডযোগ্য")}</th>
                <th scope="col" className="p-2">{t("Qty to refund", "কত ইউনিট")}</th>
                <th scope="col" className="p-2">{t("Restock", "স্টকে ফেরত")}</th>
                <th scope="col" className="p-2">{t("Amount", "পরিমাণ")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((i) => {
                const remaining = Number(i.quantity) - (refundedByItem.get(i.id) ?? 0);
                const q = qty[i.id] ?? 0;
                return (
                  <tr key={i.id}>
                    <td className="p-2">
                      {i.product_title}
                      {i.variant_name ? (
                        <span className="text-muted-foreground"> · {i.variant_name}</span>
                      ) : null}
                    </td>
                    <td className="money p-2">{remaining}</td>
                    <td className="p-2">
                      <input
                        type="number"
                        min={0}
                        max={remaining}
                        value={q}
                        disabled={remaining <= 0 || closed}
                        aria-label={`Quantity to refund for ${i.product_title}`}
                        onChange={(e) =>
                          setQty((prev) => ({
                            ...prev,
                            [i.id]: Math.max(0, Math.min(remaining, Number(e.target.value) || 0)),
                          }))
                        }
                        className={`${input} money w-24`}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={restock[i.id] ?? true}
                        disabled={remaining <= 0 || closed}
                        aria-label={`Return ${i.product_title} to stock`}
                        onChange={(e) => setRestock((p) => ({ ...p, [i.id]: e.target.checked }))}
                        className="size-4"
                      />
                    </td>
                    <td className="money p-2">
                      {fmtMinor(q * Number(i.unit_price_minor_int), currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[200px_1fr_auto]">
          <label className="text-sm">
            <span className="block text-muted-foreground">{t("Reason", "কারণ")}</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={`${input} mt-1`}
            >
              {REFUND_REASONS.map(([value, en, bn]) => (
                <option key={value} value={value}>
                  {t(en, bn)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-muted-foreground">{t("Note (optional)", "নোট (ঐচ্ছিক)")}</span>
            <input
              value={refundNote}
              maxLength={300}
              onChange={(e) => setRefundNote(e.target.value)}
              className={`${input} mt-1`}
            />
          </label>
          <button
            type="button"
            disabled={selected.length === 0 || refundMutation.isPending || closed}
            onClick={() => refundMutation.mutate()}
            className={`${primary} mt-6`}
          >
            {refundMutation.isPending
              ? t("Refunding…", "রিফান্ড হচ্ছে…")
              : `${t("Refund", "রিফান্ড")} ${fmtMinor(selectedTotal, currency)}`}
          </button>
        </div>

        {(data?.refundLines?.length ?? 0) > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("Already refunded", "আগে রিফান্ড হয়েছে")}:{" "}
            {(data?.refundLines ?? [])
              .map((l) => {
                const item = items.find((i) => i.id === l.order_item_id);
                return `${item?.product_title ?? "line"} ×${l.quantity}${l.restock ? "" : " (no restock)"}`;
              })
              .join(" · ")}
          </p>
        )}
      </section>

      {/* ------------------------------- COD calls -------------------------------- */}
      <section className={card}>
        <h2 className="text-sm font-semibold">{t("Confirm by call", "কলে নিশ্চিত করুন")}</h2>
        {!isCod ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("This order is prepaid — no call needed.", "এই অর্ডার প্রিপেইড — কল দরকার নেই।")}
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "Three unreachable attempts auto-cancel the order; a refusal cancels it at once.",
                "তিনবার যোগাযোগ না হলে অর্ডার স্বয়ংক্রিয়ভাবে বাতিল; প্রত্যাখ্যান করলে সঙ্গে সঙ্গে বাতিল।",
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {COD_OUTCOMES.map(([value, en, bn]) => (
                <button
                  key={value}
                  type="button"
                  disabled={closed || callMutation.isPending}
                  onClick={() => callMutation.mutate(value)}
                  className={ghost}
                >
                  {t(en, bn)}
                </button>
              ))}
            </div>
            <ol className="mt-3 space-y-2">
              {calls.map((c) => (
                <li key={c.id} className="rounded-fq-md border border-border p-2 text-xs">
                  <span className="font-medium">
                    #{c.attempt_no} {c.outcome}
                  </span>
                  {c.note ? <span className="text-muted-foreground"> · {c.note}</span> : null}
                  <span className="money block text-muted-foreground">
                    {new Date(c.created_at).toLocaleString("en-BD")}
                  </span>
                </li>
              ))}
              {calls.length === 0 && (
                <li className="text-xs text-muted-foreground">{t("No calls yet.", "এখনো কোনো কল নেই।")}</li>
              )}
            </ol>
          </>
        )}
      </section>

      {/* --------------------------- notes and internal tags ---------------------- */}
      <section className={card}>
        <h2 className="text-sm font-semibold">{t("Internal notes & tags", "অভ্যন্তরীণ নোট ও ট্যাগ")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("Staff only — the customer never sees these.", "শুধু স্টাফের জন্য — গ্রাহক দেখতে পান না।")}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
              {tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => saveTags.mutate(tags.filter((x) => x !== tag))}
                className="text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (tagDraft.trim()) saveTags.mutate([...tags, tagDraft]);
          }}
        >
          <input
            value={tagDraft}
            maxLength={32}
            placeholder={t("vip, call-before-delivery", "vip, ডেলিভারির আগে কল")}
            onChange={(e) => setTagDraft(e.target.value)}
            className={input}
          />
          <button type="submit" className={ghost} disabled={saveTags.isPending}>
            {t("Add tag", "ট্যাগ যোগ")}
          </button>
        </form>

        <form
          className="mt-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (noteDraft.trim().length >= 2) addNote.mutate(noteDraft);
          }}
        >
          <label className="block text-sm">
            <span className="block text-muted-foreground">{t("Add a note", "নোট লিখুন")}</span>
            <textarea
              value={noteDraft}
              maxLength={2000}
              rows={2}
              onChange={(e) => setNoteDraft(e.target.value)}
              className="mt-1 w-full rounded-fq-md border border-border bg-background p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          </label>
          <button type="submit" className={primary} disabled={addNote.isPending}>
            {t("Save note", "নোট সংরক্ষণ")}
          </button>
        </form>

        <ul className="mt-3 space-y-2">
          {(data?.notes ?? []).map((n) => (
            <li key={n.id} className="rounded-fq-md border border-border p-2 text-sm">
              <p>{n.body}</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="money text-xs text-muted-foreground">
                  {new Date(n.created_at).toLocaleString("en-BD")}
                </span>
                <button
                  type="button"
                  onClick={() => removeNote.mutate(n.id)}
                  className="text-xs text-danger-foreground underline-offset-2 hover:underline"
                >
                  {t("Delete", "মুছুন")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
