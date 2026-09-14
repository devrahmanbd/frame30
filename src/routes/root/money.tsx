import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useLang } from "@/lib/i18n";
import { moneyDeskFn } from "@/lib/money.functions";
import { OwnerHeader, OwnerTable, StatCard, StatGrid, StatePill } from "@/components/root/OwnerUi";

export const Route = createFileRoute("/root/money")({
  head: () => ({
    meta: [
      { title: "Money engine — Framique owner console" },
      {
        name: "description",
        content:
          "Currency conformance, append-only ledger integrity, legal-year VAT coverage and the FX snapshots behind the USD pilot.",
      },
      { property: "og:title", content: "Money engine — Framique owner console" },
      {
        property: "og:description",
        content: "Ledger integrity, VAT coverage and FX snapshots for Framique.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MoneyDesk,
});

const num = "tabular-nums";

function MoneyDesk() {
  const { t } = useLang();
  const load = useServerFn(moneyDeskFn);
  const { data, isLoading, error } = useQuery({ queryKey: ["money-desk"], queryFn: () => load() });

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {t("Loading money engine posture…", "মানি ইঞ্জিনের অবস্থা লোড হচ্ছে…")}
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-6 text-sm text-destructive">
        {t("Money desk unavailable.", "মানি ডেস্ক পাওয়া যাচ্ছে না।")}
      </div>
    );
  }

  const c = data.conformance;
  const clean = data.breaches === 0;

  return (
    <div className="space-y-8 p-6">
      <OwnerHeader
        title={t("Money engine", "মানি ইঞ্জিন")}
        subtitle={t(
          "Integer minor units, immutable ledger rows, VAT from the legal-year table and FX only off stored snapshots.",
          "পূর্ণসংখ্যা মাইনর ইউনিট, অপরিবর্তনীয় লেজার সারি, আইনি বছরের টেবিল থেকে ভ্যাট এবং শুধু সংরক্ষিত স্ন্যাপশট থেকে এফএক্স।",
        )}
      />

      <StatGrid>
        <StatCard label={t("Invariant breaches", "নিয়মভঙ্গ")} value={String(data.breaches)} />
        <StatCard label={t("Ledger rows", "লেজার সারি")} value={String(c.ledger_rows)} />
        <StatCard
          label={t("Split mismatches", "স্প্লিট অমিল")}
          value={String(c.split_mismatch_rows)}
        />
        <StatCard
          label={t("Currency mismatches", "মুদ্রা অমিল")}
          value={String(c.currency_mismatch_rows)}
        />
      </StatGrid>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t("Conformance", "সঙ্গতি")}</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <StatePill tone={clean ? "ok" : "bad"}>
            {clean
              ? t("All money invariants hold", "সব মানি নিয়ম বহাল")
              : t("Action required", "ব্যবস্থা প্রয়োজন")}
          </StatePill>
          <span className="text-muted-foreground">
            {t("Float-typed money columns", "ফ্লোট-টাইপ মানি কলাম")}:{" "}
            <span className={num}>{c.float_money_columns.length}</span>
          </span>
          <span className="text-muted-foreground">
            {t("Missing append-only triggers", "অনুপস্থিত append-only ট্রিগার")}:{" "}
            <span className={num}>{c.missing_append_only_triggers.length}</span>
          </span>
        </div>
        {c.float_money_columns.length > 0 && (
          <ul className="list-inside list-disc text-sm text-destructive">
            {c.float_money_columns.map((col) => (
              <li key={col}>{col}</li>
            ))}
          </ul>
        )}
        {c.missing_append_only_triggers.length > 0 && (
          <ul className="list-inside list-disc text-sm text-destructive">
            {c.missing_append_only_triggers.map((tbl) => (
              <li key={tbl}>{tbl}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t("VAT legal years", "ভ্যাট আইনি বছর")}</h2>
        <StatePill tone={data.vat.currentYearCovered ? "ok" : "bad"}>
          {data.vat.currentYearCovered
            ? t(`Covered for ${data.vat.year}`, `${data.vat.year} সালের জন্য কভার করা আছে`)
            : t(`No rate for ${data.vat.year}`, `${data.vat.year} সালের হার নেই`)}
        </StatePill>
        <OwnerTable
          head={[
            t("Country", "দেশ"),
            t("Category", "ক্যাটেগরি"),
            t("Rate", "হার"),
            t("Effective year", "কার্যকর বছর"),
          ]}
        >
          {data.vat.rows.map((r) => (
            <tr key={`${r.country_code}-${r.category}-${r.effective_year}`}>
              <td className="px-3 py-2">{r.country_code}</td>
              <td className="px-3 py-2">{r.category}</td>
              <td className={`px-3 py-2 ${num}`}>{(r.rate_basis_points / 100).toFixed(2)}%</td>
              <td className={`px-3 py-2 ${num}`}>{r.effective_year}</td>
            </tr>
          ))}
        </OwnerTable>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t("FX snapshots", "এফএক্স স্ন্যাপশট")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Conversion is restricted to the USD pilot and always reads the newest stored snapshot — never a live quote at charge time.",
            "রূপান্তর শুধু ইউএসডি পাইলটে সীমিত এবং সর্বদা সর্বশেষ সংরক্ষিত স্ন্যাপশট পড়ে — চার্জের সময় লাইভ কোট নয়।",
          )}
        </p>
        <OwnerTable
          head={[
            t("Pair", "জোড়া"),
            t("Rate", "হার"),
            t("Source", "সূত্র"),
            t("Effective at", "কার্যকর"),
          ]}
        >
          {data.fx.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2">
                {r.base_currency} → {r.quote_currency}
              </td>
              <td className={`px-3 py-2 ${num}`}>{r.rate.toFixed(6)}</td>
              <td className="px-3 py-2">{r.source}</td>
              <td className={`px-3 py-2 ${num}`}>
                {new Date(r.effective_at).toISOString().slice(0, 10)}
              </td>
            </tr>
          ))}
        </OwnerTable>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t("Runtime counters", "রানটাইম কাউন্টার")}</h2>
        {data.metrics.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("No money traffic in this isolate yet.", "এই ইনস্ট্যান্সে এখনো মানি ট্রাফিক নেই।")}
          </p>
        ) : (
          <OwnerTable head={[t("Counter", "কাউন্টার"), t("Value", "মান")]}>
            {data.metrics.map((m) => (
              <tr key={m.name}>
                <td className="px-3 py-2 font-mono text-xs">{m.name}</td>
                <td className={`px-3 py-2 ${num}`}>{m.value}</td>
              </tr>
            ))}
          </OwnerTable>
        )}
      </section>
    </div>
  );
}
