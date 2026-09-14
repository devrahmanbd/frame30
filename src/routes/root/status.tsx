import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import {
  opsComponentStateFn,
  opsIncidentOpenFn,
  opsIncidentUpdateFn,
  opsIncidentsFn,
} from "@/lib/ops.functions";
import {
  canTransition,
  COMPONENT_STATES,
  INCIDENT_STATUSES,
  overallStatus,
  statusHeadline,
  type ComponentState,
  type IncidentStatus,
} from "@/lib/ops";
import { OwnerHeader, OwnerTable, StatePill } from "@/components/root/OwnerUi";

export const Route = createFileRoute("/root/status")({
  head: () => ({
    meta: [
      { title: "Status & incidents — Framique owner console" },
      {
        name: "description",
        content:
          "Drive the public Framique status page: set component health, open incidents, and post timeline updates that merchants can read.",
      },
      { property: "og:title", content: "Status & incidents — Framique owner console" },
      {
        property: "og:description",
        content: "Component health, incident lifecycle and public communications in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StatusDesk,
});

const btn =
  "rounded-fq-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50";
const field = "rounded-fq-md border border-border bg-background px-3 py-2 text-sm";

const STATE_TONE: Record<ComponentState, "ok" | "warn" | "bad"> = {
  operational: "ok",
  maintenance: "warn",
  degraded: "warn",
  partial_outage: "bad",
  major_outage: "bad",
};

function StatusDesk() {
  const { t } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(opsIncidentsFn);
  const open = useServerFn(opsIncidentOpenFn);
  const update = useServerFn(opsIncidentUpdateFn);
  const setState = useServerFn(opsComponentStateFn);

  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<"minor" | "major" | "critical">("minor");
  const [affected, setAffected] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [body, setBody] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [updateBody, setUpdateBody] = useState("");
  const [updateStatus, setUpdateStatus] = useState<IncidentStatus>("identified");

  const { data, isLoading, error } = useQuery({
    queryKey: ["owner-status"],
    queryFn: () => load(),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  const components = data?.components ?? [];
  const incidents = data?.incidents ?? [];
  const updates = data?.updates ?? [];
  const overall = useMemo(
    () => overallStatus(components.map((c) => c.state as ComponentState)),
    [components],
  );
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["owner-status"] });

  const openMut = useMutation({
    mutationFn: () =>
      open({ data: { title, severity, components: affected, isPublic, body } }),
    onSuccess: () => {
      setTitle("");
      setBody("");
      setAffected([]);
      toast.success(t("Incident opened", "ইনসিডেন্ট খোলা হয়েছে"));
      invalidate();
    },
    onError: () => toast.error(t("Incident could not be opened", "ইনসিডেন্ট খোলা যায়নি")),
  });

  const updateMut = useMutation({
    mutationFn: (id: string) => update({ data: { id, status: updateStatus, body: updateBody } }),
    onSuccess: () => {
      setUpdateBody("");
      toast.success(t("Update posted", "আপডেট পোস্ট হয়েছে"));
      invalidate();
    },
    onError: () =>
      toast.error(
        t("Update rejected — check the lifecycle step", "আপডেট বাতিল — লাইফসাইকেল ধাপ দেখুন"),
      ),
  });

  const stateMut = useMutation({
    mutationFn: (v: { key: string; state: ComponentState }) => setState({ data: v }),
    onSuccess: () => {
      toast.success(t("Component state saved", "কম্পোনেন্ট স্টেট সেভ হয়েছে"));
      invalidate();
    },
    onError: () => toast.error(t("State could not be saved", "স্টেট সেভ হয়নি")),
  });

  const current = incidents.find((i) => i.id === active) ?? null;

  return (
    <section className="space-y-6">
      <OwnerHeader
        title={t("Status & incidents", "স্ট্যাটাস ও ইনসিডেন্ট")}
        subtitle={t(
          "What you set here is what merchants read on the public status page. Updates are append-only, so the timeline is always the truth.",
          "এখানে যা সেট করবেন, মার্চেন্টরা পাবলিক স্ট্যাটাস পেজে তাই দেখবে। আপডেট কেবল যুক্ত হয়, তাই টাইমলাইন সবসময় সত্য।",
        )}
      />

      <div className="rounded-fq-md border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium">{statusHeadline(overall)}</p>
          <StatePill tone={STATE_TONE[overall]}>{overall}</StatePill>
        </div>
        <ul className="mt-3 space-y-2">
          {components.map((c) => (
            <li key={c.key} className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm">{c.label}</span>
              <div className="flex items-center gap-2">
                <StatePill tone={STATE_TONE[c.state as ComponentState]}>{c.state}</StatePill>
                <label className="text-xs">
                  <span className="sr-only">{c.label}</span>
                  <select
                    className={field}
                    value={c.state}
                    disabled={stateMut.isPending}
                    onChange={(e) =>
                      stateMut.mutate({ key: c.key, state: e.target.value as ComponentState })
                    }
                  >
                    {COMPONENT_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          {t("This desk is owner-only and could not be read.", "এই ডেস্ক শুধু ওনারের, পড়া যায়নি।")}
        </p>
      ) : null}

      <form
        className="space-y-3 rounded-fq-md border border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          openMut.mutate();
        }}
      >
        <h3 className="text-base font-semibold">{t("Open an incident", "ইনসিডেন্ট খুলুন")}</h3>
        <label className="block space-y-1 text-xs font-medium">
          {t("Title", "শিরোনাম")}
          <input
            className={`${field} block w-full`}
            value={title}
            required
            minLength={4}
            maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="space-y-1 text-xs font-medium">
            {t("Severity", "তীব্রতা")}
            <select
              className={`${field} block`}
              value={severity}
              onChange={(e) => setSeverity(e.target.value as typeof severity)}
            >
              <option value="minor">minor</option>
              <option value="major">major</option>
              <option value="critical">critical</option>
            </select>
          </label>
          <fieldset className="space-y-1 text-xs font-medium">
            <legend>{t("Affected components", "প্রভাবিত কম্পোনেন্ট")}</legend>
            <div className="flex flex-wrap gap-2">
              {components.map((c) => (
                <label key={c.key} className="flex items-center gap-1 rounded-fq-sm border border-border px-2 py-1">
                  <input
                    type="checkbox"
                    checked={affected.includes(c.key)}
                    onChange={(e) =>
                      setAffected((prev) =>
                        e.target.checked ? [...prev, c.key] : prev.filter((k) => k !== c.key),
                      )
                    }
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 self-end text-xs font-medium">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            {t("Show on public status page", "পাবলিক স্ট্যাটাস পেজে দেখান")}
          </label>
        </div>
        <label className="block space-y-1 text-xs font-medium">
          {t("First update", "প্রথম আপডেট")}
          <textarea
            className={`${field} block w-full`}
            rows={3}
            required
            minLength={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <button type="submit" className={btn} disabled={openMut.isPending}>
          {t("Open incident", "ইনসিডেন্ট খুলুন")}
        </button>
      </form>

      <OwnerTable
        head={[
          t("Started", "শুরু"),
          t("Title", "শিরোনাম"),
          t("Severity", "তীব্রতা"),
          t("Status", "অবস্থা"),
          t("Visibility", "দৃশ্যমানতা"),
          "",
        ]}
      >
        {isLoading ? (
          <tr>
            <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t("Loading…", "লোড হচ্ছে…")}
            </td>
          </tr>
        ) : incidents.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t("No incidents recorded.", "কোনো ইনসিডেন্ট নেই।")}
            </td>
          </tr>
        ) : (
          incidents.map((i) => (
            <tr key={i.id} className="border-t border-border">
              <td className="px-3 py-2 text-xs tabular-nums">
                {new Date(i.started_at).toLocaleString()}
              </td>
              <td className="px-3 py-2 text-sm">{i.title}</td>
              <td className="px-3 py-2 text-xs">{i.severity}</td>
              <td className="px-3 py-2">
                <StatePill tone={i.status === "resolved" ? "ok" : "warn"}>{i.status}</StatePill>
              </td>
              <td className="px-3 py-2 text-xs">
                {i.is_public ? t("Public", "পাবলিক") : t("Internal", "অভ্যন্তরীণ")}
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  className={btn}
                  onClick={() => setActive((prev) => (prev === i.id ? null : i.id))}
                >
                  {active === i.id ? t("Close", "বন্ধ") : t("Timeline", "টাইমলাইন")}
                </button>
              </td>
            </tr>
          ))
        )}
      </OwnerTable>

      {current ? (
        <div className="space-y-3 rounded-fq-md border border-border p-4">
          <h3 className="text-base font-semibold">{current.title}</h3>
          <ol className="space-y-2">
            {updates
              .filter((u) => u.incident_id === current.id)
              .map((u) => (
                <li key={u.id} className="rounded-fq-sm border border-border p-2">
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {new Date(u.created_at).toLocaleString()} · {u.status}
                  </p>
                  <p className="text-sm">{u.body}</p>
                </li>
              ))}
          </ol>
          {current.status === "resolved" ? (
            <p className="text-xs text-muted-foreground">
              {t("Resolved incidents are closed for edits.", "সমাধান হওয়া ইনসিডেন্ট আর সম্পাদনা করা যায় না।")}
            </p>
          ) : (
            <div className="space-y-2">
              <label className="block space-y-1 text-xs font-medium">
                {t("Next step", "পরবর্তী ধাপ")}
                <select
                  className={`${field} block`}
                  value={updateStatus}
                  onChange={(e) => setUpdateStatus(e.target.value as IncidentStatus)}
                >
                  {INCIDENT_STATUSES.filter(
                    (s) => s === current.status || canTransition(current.status, s),
                  ).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                className={`${field} block w-full`}
                rows={3}
                value={updateBody}
                placeholder={t("What changed since the last update?", "গত আপডেটের পর কী বদলেছে?")}
                onChange={(e) => setUpdateBody(e.target.value)}
              />
              <button
                type="button"
                className={btn}
                disabled={updateMut.isPending || updateBody.trim().length < 4}
                onClick={() => updateMut.mutate(current.id)}
              >
                {t("Post update", "আপডেট পোস্ট")}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
