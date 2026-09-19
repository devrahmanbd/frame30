import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  btnGhost,
  btnPrimary,
  inputClass,
  Field,
  StatusPill,
} from "@/components/admin/MarketingUi";
import { SectionCard } from "@/components/admin/DeveloperUi";
import { InlineAlert } from "@/components/admin/FinanceUi";
import {
  listDripSequencesFn,
  saveDripSequenceFn,
  toggleDripSequenceStatusFn,
  deleteDripSequenceFn,
  enrollContactsInSequenceFn,
  processDueDripStepsFn,
  triggerDripStepTestFn,
} from "@/lib/drip-sequences.functions";
import type { DripSequence, DripStep } from "@/lib/drip-sequences.server";
import { useLang } from "@/lib/i18n";
import {
  Send,
  Plus,
  Trash2,
  Play,
  Pause,
  Clock,
  UserPlus,
  Users,
  CheckCircle,
  AlertCircle,
  Layers,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/dashboard/marketing/sequences",
)({
  loader: async () => {
    return await listDripSequencesFn();
  },
  head: () => ({
    meta: [
      { title: "Drip Sequences & Cold Outreach — Framique Marketing" },
      {
        name: "description",
        content:
          "Automated multi-step cold mail and nurturing sequences with delay scheduling and consent checks.",
      },
      { property: "og:title", content: "Drip Sequences & Cold Outreach" },
      { property: "robots", content: "noindex" },
    ],
  }),
  component: DripSequencesPage,
});

type LoaderData = Awaited<ReturnType<typeof listDripSequencesFn>>;

function DripSequencesPage() {
  const { t } = useLang();
  const initial = Route.useLoaderData() as LoaderData;

  const [sequences, setSequences] = useState<DripSequence[]>(initial);
  const [editingSeq, setEditingSeq] = useState<DripSequence | null>(null);
  const [enrollModalSeq, setEnrollModalSeq] = useState<DripSequence | null>(
    null,
  );
  const [enrollText, setEnrollText] = useState("");
  const [testModalStep, setTestModalStep] = useState<{
    seqId: string;
    stepNumber: number;
  } | null>(null);
  const [testEmail, setTestEmail] = useState("");

  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const saveSequence = useServerFn(saveDripSequenceFn);
  const toggleStatus = useServerFn(toggleDripSequenceStatusFn);
  const deleteSeq = useServerFn(deleteDripSequenceFn);
  const enrollContacts = useServerFn(enrollContactsInSequenceFn);
  const processDue = useServerFn(processDueDripStepsFn);
  const triggerTest = useServerFn(triggerDripStepTestFn);

  // Stats calculation
  const totalEnrolled = sequences.reduce(
    (acc, s) => acc + (s.stats?.enrolledCount || 0),
    0,
  );
  const totalSent = sequences.reduce(
    (acc, s) => acc + (s.stats?.sentCount || 0),
    0,
  );
  const totalCompleted = sequences.reduce(
    (acc, s) => acc + (s.stats?.completedCount || 0),
    0,
  );
  const activeCount = sequences.filter((s) => s.status === "active").length;

  const handleCreateNew = () => {
    const newSeq: DripSequence = {
      id: "",
      merchantId: "",
      name: "New Cold Outreach Sequence",
      description: "Automated sequence to engage new contacts",
      trigger: "cold_outreach",
      status: "draft",
      steps: [
        {
          id: `step_${Date.now()}_1`,
          stepNumber: 1,
          delayDays: 0,
          delayHours: 0,
          subject: "Quick introduction from {{store_name}}",
          bodyTemplate:
            "Hi {{customer_name}},\n\nI wanted to personally reach out and introduce you to our curated products.",
          ctaText: "Visit Store",
          ctaUrl: "https://framique.qubickle.com/store/{{store_slug}}",
        },
        {
          id: `step_${Date.now()}_2`,
          stepNumber: 2,
          delayDays: 2,
          delayHours: 0,
          subject: "Checking back on your thoughts",
          bodyTemplate:
            "Hi {{customer_name}},\n\nFollowing up on my previous note. Did you have a chance to check out our recent collection?",
          ctaText: "Explore Collection",
          ctaUrl: "https://framique.qubickle.com/store/{{store_slug}}",
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stats: { enrolledCount: 0, completedCount: 0, sentCount: 0 },
    };
    setEditingSeq(newSeq);
  };

  const handleToggleActive = async (seq: DripSequence) => {
    const nextStatus = seq.status === "active" ? "paused" : "active";
    setBusy(true);
    try {
      const updated = await toggleStatus({
        data: { sequenceId: seq.id, status: nextStatus },
      });
      setSequences((prev) => prev.map((s) => (s.id === seq.id ? updated : s)));
      setStatusMsg({
        ok: true,
        message: t(
          `Sequence ${nextStatus === "active" ? "activated" : "paused"} successfully.`,
          `সিকোয়েন্স ${nextStatus === "active" ? "সক্রিয়" : "স্থগিত"} করা হয়েছে।`,
        ),
      });
    } catch (err) {
      setStatusMsg({
        ok: false,
        message:
          err instanceof Error ? err.message : "Failed to toggle status.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (seqId: string) => {
    if (
      !window.confirm(
        t(
          "Delete this sequence permanently?",
          "এই সিকোয়েন্সটি স্থায়ীভাবে মুছে ফেলতে চান?",
        ),
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteSeq({ data: { sequenceId: seqId } });
      setSequences((prev) => prev.filter((s) => s.id !== seqId));
      if (editingSeq?.id === seqId) setEditingSeq(null);
      setStatusMsg({
        ok: true,
        message: t("Sequence deleted.", "সিকোয়েন্স মুছে ফেলা হয়েছে।"),
      });
    } catch (err) {
      setStatusMsg({
        ok: false,
        message: err instanceof Error ? err.message : "Delete failed.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleProcessDue = async () => {
    setBusy(true);
    try {
      const res = await processDue();
      setStatusMsg({
        ok: true,
        message: t(
          `Drip runner finished: ${res.sent} sent, ${res.completed} completed, ${res.suppressed} suppressed.`,
          `ড্রিপ রানার সম্পন্ন: ${res.sent}টি পাঠানো হয়েছে, ${res.completed}টি শেষ হয়েছে।`,
        ),
      });
    } catch (err) {
      setStatusMsg({
        ok: false,
        message: err instanceof Error ? err.message : "Run failed.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSeq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSeq) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const saved = await saveSequence({
        data: {
          id: editingSeq.id || undefined,
          name: editingSeq.name,
          description: editingSeq.description,
          trigger: editingSeq.trigger,
          status: editingSeq.status,
          steps: editingSeq.steps.map((s, idx) => ({
            id: s.id,
            delayDays: Number(s.delayDays) || 0,
            delayHours: Number(s.delayHours) || 0,
            subject: s.subject,
            bodyTemplate: s.bodyTemplate,
            ctaText: s.ctaText,
            ctaUrl: s.ctaUrl,
          })),
        },
      });

      setSequences((prev) => {
        const idx = prev.findIndex((s) => s.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [saved, ...prev];
      });
      setEditingSeq(null);
      setStatusMsg({
        ok: true,
        message: t(
          "Sequence saved successfully!",
          "সিকোয়েন্স সংরক্ষিত হয়েছে!",
        ),
      });
    } catch (err) {
      setStatusMsg({
        ok: false,
        message: err instanceof Error ? err.message : "Failed to save.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleEnrollContacts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollModalSeq || !enrollText.trim()) return;
    setBusy(true);
    try {
      const lines = enrollText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const contacts = lines.map((l) => {
        const parts = l.split(/[,;\t]/).map((p) => p.trim());
        const email = parts[0]!;
        const name = parts[1] || undefined;
        return { email, name };
      });

      const res = await enrollContacts({
        data: {
          sequenceId: enrollModalSeq.id,
          contacts,
        },
      });

      setStatusMsg({
        ok: true,
        message: t(
          `Enrolled ${res.enrolled} contacts (${res.skipped} skipped or already enrolled/unsubscribed).`,
          `${res.enrolled} জন যোগাযোগ যুক্ত করা হয়েছে।`,
        ),
      });
      setEnrollModalSeq(null);
      setEnrollText("");
      // Refresh list
      const refreshed = await listDripSequencesFn();
      setSequences(refreshed);
    } catch (err) {
      setStatusMsg({
        ok: false,
        message: err instanceof Error ? err.message : "Enrollment failed.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleTestStep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testModalStep || !testEmail.trim()) return;
    setBusy(true);
    try {
      const res = await triggerTest({
        data: {
          sequenceId: testModalStep.seqId,
          stepNumber: testModalStep.stepNumber,
          testEmail: testEmail.trim(),
        },
      });
      if (res.ok) {
        setStatusMsg({
          ok: true,
          message: t(
            "Test step executed and sent to your email!",
            "টেস্ট ধাপ পাঠানো হয়েছে!",
          ),
        });
        setTestModalStep(null);
        setTestEmail("");
      } else {
        setStatusMsg({
          ok: false,
          message: res.error || "Test execution failed.",
        });
      }
    } catch (err) {
      setStatusMsg({
        ok: false,
        message: err instanceof Error ? err.message : "Error.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              {t(
                "Drip Sequences & Cold Outreach",
                "ড্রিপ সিকোয়েন্স ও কোল্ড আউটরিচ",
              )}
            </h1>
            <StatusPill
              tone="info"
              label={`${sequences.length} ${t("Sequences", "সিকোয়েন্স")}`}
            />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              "Automate multi-step cold mail and nurturing drip sequences with delays, audit logs, and one-click unsubscribe compliance.",
              "সময়সূচী অনুযায়ী পর্যায়ক্রমিক কোল্ড মেইল ও গ্রাহক নার্চারিং সিকোয়েন্স তৈরি ও পরিচালনা করুন।",
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleProcessDue}
            disabled={busy}
            className={`${btnGhost} min-h-[44px] flex items-center gap-2 text-xs md:text-sm`}
          >
            <Clock className="size-4" />
            <span>{t("Run Due Steps", "সময়োচিত ধাপগুলো রান করুন")}</span>
          </button>
          <button
            type="button"
            onClick={handleCreateNew}
            className={`${btnPrimary} min-h-[44px] flex items-center gap-2 text-xs md:text-sm`}
          >
            <Plus className="size-4" />
            <span>{t("New Sequence", "নতুন সিকোয়েন্স")}</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <InlineAlert
          tone={statusMsg.ok ? "success" : "danger"}
          message={statusMsg.message}
        />
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-fq-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t("Active Sequences", "সক্রিয় সিকোয়েন্স")}
            </span>
            <Play className="size-4 text-success" />
          </div>
          <div className="text-2xl font-bold text-foreground mt-2">
            {activeCount}
          </div>
        </div>

        <div className="rounded-fq-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t("Enrolled Contacts", "যুক্ত যোগাযোগ")}
            </span>
            <Users className="size-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground mt-2">
            {totalEnrolled}
          </div>
        </div>

        <div className="rounded-fq-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t("Drip Emails Sent", "প্রেরিত বার্তা")}
            </span>
            <Send className="size-4 text-accent-foreground" />
          </div>
          <div className="text-2xl font-bold text-foreground mt-2">
            {totalSent}
          </div>
        </div>

        <div className="rounded-fq-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t("Completed Journeys", "সম্পন্ন যাত্রা")}
            </span>
            <CheckCircle className="size-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-foreground mt-2">
            {totalCompleted}
          </div>
        </div>
      </div>

      {/* Sequence List */}
      {!editingSeq && (
        <div className="space-y-4">
          {sequences.length === 0 ? (
            <div className="text-center py-12 rounded-fq-lg border border-dashed border-border bg-card">
              <Layers className="size-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-base font-semibold text-foreground">
                {t(
                  "No Drip Sequences Yet",
                  "কোনো ড্রিপ সিকোয়েন্স তৈরি করা হয়নি",
                )}
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1 mb-4">
                {t(
                  "Create your first automated cold mail or welcome sequence to nurture leads.",
                  "গ্রাহক বৃদ্ধির জন্য আপনার প্রথম স্বয়ংক্রিয় সিকোয়েন্স তৈরি করুন।",
                )}
              </p>
              <button
                type="button"
                onClick={handleCreateNew}
                className={`${btnPrimary} min-h-[44px]`}
              >
                {t("Create Sequence", "সিকোয়েন্স তৈরি করুন")}
              </button>
            </div>
          ) : (
            sequences.map((seq) => (
              <div
                key={seq.id}
                className="rounded-fq-lg border border-border bg-card p-5 hover:border-primary/40 transition-colors shadow-sm"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg text-foreground">
                        {seq.name}
                      </h3>
                      <StatusPill
                        tone={
                          seq.status === "active"
                            ? "success"
                            : seq.status === "paused"
                              ? "warning"
                              : "neutral"
                        }
                        label={seq.status.toUpperCase()}
                      />
                      <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                        {seq.trigger === "new_subscriber"
                          ? t("Auto: New Subscriber", "নতুন গ্রাহক")
                          : t("Cold Outreach / Batch", "কোল্ড আউটরিচ")}
                      </span>
                    </div>
                    {seq.description && (
                      <p className="text-xs text-muted-foreground">
                        {seq.description}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(seq)}
                      disabled={busy}
                      className={`${btnGhost} min-h-[40px] px-3 flex items-center gap-1.5 text-xs`}
                    >
                      {seq.status === "active" ? (
                        <>
                          <Pause className="size-3.5 text-warning" />
                          <span>{t("Pause", "স্থগিত")}</span>
                        </>
                      ) : (
                        <>
                          <Play className="size-3.5 text-success" />
                          <span>{t("Activate", "সক্রিয়")}</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEnrollModalSeq(seq)}
                      className={`${btnGhost} min-h-[40px] px-3 flex items-center gap-1.5 text-xs`}
                    >
                      <UserPlus className="size-3.5 text-primary" />
                      <span>{t("Enroll Contacts", "কন্টাক্ট যুক্ত করুন")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSeq(seq)}
                      className={`${btnGhost} min-h-[40px] px-3 text-xs`}
                    >
                      {t("Edit Steps", "ধাপ সম্পাদনা")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(seq.id)}
                      disabled={busy}
                      className={`${btnGhost} min-h-[40px] px-2 text-danger hover:bg-danger-soft`}
                      aria-label="Delete sequence"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>

                {/* Steps Timeline Visualizer */}
                <div className="mt-5 pt-4 border-t border-border/60">
                  <span className="text-xs font-medium text-muted-foreground block mb-2">
                    {t(
                      "Sequence Progression Timeline:",
                      "সিকোয়েন্সের সময়রেখা:",
                    )}
                  </span>
                  <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {seq.steps.map((step, idx) => (
                      <div
                        key={step.id || idx}
                        className="flex items-center gap-2 shrink-0"
                      >
                        <div className="border border-border bg-muted/40 rounded-fq-md p-2.5 min-w-[200px] text-xs">
                          <div className="flex items-center justify-between text-muted-foreground mb-1">
                            <span className="font-semibold text-foreground">
                              Step {step.stepNumber}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="size-3" />
                              {step.delayDays === 0 && step.delayHours === 0
                                ? t("Immediately", "তাৎক্ষণিক")
                                : `+${step.delayDays}d ${step.delayHours}h`}
                            </span>
                          </div>
                          <div className="font-medium text-foreground truncate">
                            {step.subject}
                          </div>
                        </div>
                        {idx < seq.steps.length - 1 && (
                          <ArrowRight className="size-4 text-muted-foreground shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stats Bar */}
                <div className="mt-4 flex items-center gap-6 text-xs text-muted-foreground">
                  <div>
                    {t("Enrolled:", "যুক্ত:")}{" "}
                    <strong className="text-foreground">
                      {seq.stats?.enrolledCount || 0}
                    </strong>
                  </div>
                  <div>
                    {t("Sent:", "পাঠানো:")}{" "}
                    <strong className="text-foreground">
                      {seq.stats?.sentCount || 0}
                    </strong>
                  </div>
                  <div>
                    {t("Completed:", "সম্পন্ন:")}{" "}
                    <strong className="text-foreground">
                      {seq.stats?.completedCount || 0}
                    </strong>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Sequence & Steps Editor */}
      {editingSeq && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground">
              {editingSeq.id
                ? t("Edit Sequence", "সিকোয়েন্স সম্পাদনা")
                : t("New Sequence", "নতুন সিকোয়েন্স")}
            </h2>
            <button
              type="button"
              onClick={() => setEditingSeq(null)}
              className={`${btnGhost} min-h-[40px] px-3 text-xs`}
            >
              {t("Cancel & Back to List", "বাতিল করুন")}
            </button>
          </div>

          <form onSubmit={handleSaveSeq} className="space-y-6">
            <SectionCard
              title={t("Sequence Settings", "সিকোয়েন্স সেটিংস")}
              subtitle={t(
                "Name, trigger condition, and lifecycle status",
                "নাম ও শুরুর শর্ত",
              )}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <Field label={t("Sequence Name", "সিকোয়েন্সের নাম")}>
                  <input
                    type="text"
                    required
                    className={inputClass}
                    value={editingSeq.name}
                    onChange={(e) =>
                      setEditingSeq({ ...editingSeq, name: e.target.value })
                    }
                  />
                </Field>

                <Field label={t("Trigger Type", "ট্রিগার মোড")}>
                  <select
                    className={inputClass}
                    value={editingSeq.trigger}
                    onChange={(e) =>
                      setEditingSeq({
                        ...editingSeq,
                        trigger: e.target.value as
                          "new_subscriber" | "manual_enroll" | "cold_outreach",
                      })
                    }
                  >
                    <option value="cold_outreach">
                      Cold Outreach / Manual Leads
                    </option>
                    <option value="new_subscriber">
                      Automated: New Store Subscriber
                    </option>
                    <option value="manual_enroll">
                      Manual Contact Enrollment
                    </option>
                  </select>
                </Field>
              </div>

              <Field label={t("Internal Description", "অভ্যন্তরীণ বিবরণ")}>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. Outreach campaign for apparel retail partners"
                  value={editingSeq.description || ""}
                  onChange={(e) =>
                    setEditingSeq({
                      ...editingSeq,
                      description: e.target.value,
                    })
                  }
                />
              </Field>
            </SectionCard>

            {/* Steps Timeline Builder */}
            <SectionCard
              title={t("Drip Steps Timeline", "সিকোয়েন্সের ধাপসমূহ")}
              subtitle={t(
                "Configure delays and subject copy for each chronological step",
                "প্রতিটি ধাপের বিলম্ব ও ইমেইল বার্তা",
              )}
            >
              <div className="space-y-6 pt-2">
                {editingSeq.steps.map((step, idx) => (
                  <div
                    key={step.id || idx}
                    className="rounded-fq-md border border-border bg-muted/20 p-4 space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <div className="flex items-center gap-2">
                        <span className="size-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <h4 className="font-semibold text-sm text-foreground">
                          {t(`Step ${idx + 1}`, `ধাপ ${idx + 1}`)}
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        {editingSeq.id && (
                          <button
                            type="button"
                            onClick={() =>
                              setTestModalStep({
                                seqId: editingSeq.id,
                                stepNumber: step.stepNumber,
                              })
                            }
                            className={`${btnGhost} min-h-[32px] px-2.5 text-xs flex items-center gap-1`}
                          >
                            <Send className="size-3" />
                            <span>{t("Test Step", "ধাপ পরীক্ষা")}</span>
                          </button>
                        )}
                        {editingSeq.steps.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const nextSteps = editingSeq.steps.filter(
                                (_, i) => i !== idx,
                              );
                              setEditingSeq({
                                ...editingSeq,
                                steps: nextSteps,
                              });
                            }}
                            className="text-danger hover:text-danger/80 p-1"
                            aria-label="Remove step"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Delay Configuration */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field
                        label={t("Delay Days", "দিন বিলম্ব")}
                        hint={
                          idx === 0
                            ? "0 = Send immediately upon enrollment"
                            : "Wait X days after previous step"
                        }
                      >
                        <input
                          type="number"
                          min={0}
                          className={inputClass}
                          value={step.delayDays}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            const next = [...editingSeq.steps];
                            next[idx] = { ...step, delayDays: val };
                            setEditingSeq({ ...editingSeq, steps: next });
                          }}
                        />
                      </Field>
                      <Field
                        label={t("Delay Hours", "ঘণ্টা বিলম্ব")}
                        hint="Additional hours (0-23)"
                      >
                        <input
                          type="number"
                          min={0}
                          max={23}
                          className={inputClass}
                          value={step.delayHours}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            const next = [...editingSeq.steps];
                            next[idx] = { ...step, delayHours: val };
                            setEditingSeq({ ...editingSeq, steps: next });
                          }}
                        />
                      </Field>
                    </div>

                    <Field label={t("Email Subject", "ইমেইল বিষয়")}>
                      <input
                        type="text"
                        required
                        className={inputClass}
                        value={step.subject}
                        onChange={(e) => {
                          const next = [...editingSeq.steps];
                          next[idx] = { ...step, subject: e.target.value };
                          setEditingSeq({ ...editingSeq, steps: next });
                        }}
                      />
                    </Field>

                    <Field
                      label={t("Body Copy", "বার্তা")}
                      hint="Use {{customer_name}}, {{store_name}} for interpolation"
                    >
                      <textarea
                        rows={4}
                        required
                        className={`${inputClass} resize-y`}
                        value={step.bodyTemplate}
                        onChange={(e) => {
                          const next = [...editingSeq.steps];
                          next[idx] = { ...step, bodyTemplate: e.target.value };
                          setEditingSeq({ ...editingSeq, steps: next });
                        }}
                      />
                    </Field>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field
                        label={t("CTA Button Text (Optional)", "বাটন টেক্সট")}
                      >
                        <input
                          type="text"
                          className={inputClass}
                          value={step.ctaText || ""}
                          onChange={(e) => {
                            const next = [...editingSeq.steps];
                            next[idx] = { ...step, ctaText: e.target.value };
                            setEditingSeq({ ...editingSeq, steps: next });
                          }}
                        />
                      </Field>
                      <Field label={t("CTA URL", "বাটন লিংক")}>
                        <input
                          type="text"
                          className={inputClass}
                          value={step.ctaUrl || ""}
                          onChange={(e) => {
                            const next = [...editingSeq.steps];
                            next[idx] = { ...step, ctaUrl: e.target.value };
                            setEditingSeq({ ...editingSeq, steps: next });
                          }}
                        />
                      </Field>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    const nextNum = editingSeq.steps.length + 1;
                    const newStep: DripStep = {
                      id: `step_${Date.now()}_${nextNum}`,
                      stepNumber: nextNum,
                      delayDays: 3,
                      delayHours: 0,
                      subject: `Follow-up #${nextNum}`,
                      bodyTemplate:
                        "Hi {{customer_name}},\n\nWanted to check in and see if you had any questions.",
                      ctaText: "Shop Now",
                      ctaUrl: "https://framique.qubickle.com/store/{{store_slug}}",
                    };
                    setEditingSeq({
                      ...editingSeq,
                      steps: [...editingSeq.steps, newStep],
                    });
                  }}
                  className={`${btnGhost} w-full min-h-[44px] flex items-center justify-center gap-2`}
                >
                  <Plus className="size-4" />
                  <span>{t("Add Another Step", "আরেকটি ধাপ যুক্ত করুন")}</span>
                </button>
              </div>
            </SectionCard>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setEditingSeq(null)}
                className={`${btnGhost} min-h-[44px] px-4`}
              >
                {t("Cancel", "বাতিল")}
              </button>
              <button
                type="submit"
                disabled={busy}
                className={`${btnPrimary} min-h-[44px] px-6`}
              >
                {busy
                  ? t("Saving...", "সংরক্ষণ করা হচ্ছে...")
                  : t("Save Sequence", "সিকোয়েন্স সংরক্ষণ করুন")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Enroll Contacts Modal */}
      {enrollModalSeq && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-fq-lg max-w-lg w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-foreground">
              {t(
                `Enroll Contacts into "${enrollModalSeq.name}"`,
                `কন্টাক্ট যুক্ত করুন`,
              )}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t(
                "Paste email addresses (one per line, or email, name). Contacts who previously unsubscribed via the consent ledger are automatically skipped.",
                "প্রতি লাইনে একটি করে ইমেইল (অথবা ইমেইল, নাম) দিন। পূর্বে আনসাবস্ক্রাইব করা থাকলে স্বয়ংক্রিয়ভাবে বাদ পড়বে।",
              )}
            </p>
            <form onSubmit={handleEnrollContacts} className="space-y-4">
              <textarea
                rows={6}
                required
                placeholder="customer@example.com, Tanzim Ahmed&#10;sarah@company.com, Sarah"
                value={enrollText}
                onChange={(e) => setEnrollText(e.target.value)}
                className={`${inputClass} font-mono text-xs`}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEnrollModalSeq(null)}
                  className={`${btnGhost} min-h-[40px] px-4 text-xs`}
                >
                  {t("Cancel", "বাতিল")}
                </button>
                <button
                  type="submit"
                  disabled={busy || !enrollText.trim()}
                  className={`${btnPrimary} min-h-[40px] px-5 text-xs`}
                >
                  {busy
                    ? t("Enrolling...", "যুক্ত করা হচ্ছে...")
                    : t("Enroll Leads", "যুক্ত করুন")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Test Step Modal */}
      {testModalStep && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-fq-lg max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-foreground">
              {t(
                `Send Test Execution (Step ${testModalStep.stepNumber})`,
                "টেস্ট ধাপ পাঠান",
              )}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t(
                "Enter an email to receive an immediate rendering of this step.",
                "এই ধাপের পরীক্ষামূলক ইমেইল পেতে ঠিকানা লিখুন।",
              )}
            </p>
            <form onSubmit={handleTestStep} className="space-y-4">
              <input
                type="email"
                required
                placeholder="your.email@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className={inputClass}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTestModalStep(null)}
                  className={`${btnGhost} min-h-[40px] px-4 text-xs`}
                >
                  {t("Cancel", "বাতিল")}
                </button>
                <button
                  type="submit"
                  disabled={busy || !testEmail.trim()}
                  className={`${btnPrimary} min-h-[40px] px-5 text-xs flex items-center gap-1.5`}
                >
                  <Send className="size-3.5" />
                  <span>
                    {busy
                      ? t("Sending...", "পাঠানো হচ্ছে...")
                      : t("Send Test", "টেস্ট পাঠান")}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
