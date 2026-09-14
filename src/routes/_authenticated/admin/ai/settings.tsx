import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  getAiGatewayConfigFn,
  testAiGatewayProbeFn,
  updateAiGatewayConfigFn,
} from "@/lib/ai-support.functions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/ai/settings")({
  loader: () => getAiGatewayConfigFn(),
  head: () => ({
    meta: [
      { title: "AI Gateway & Nemotron Settings — Framique admin" },
      { name: "description", content: "Configure OpenRouter Nvidia Nemotron models, dynamic key rotation, and health probes." },
      { property: "og:title", content: "AI Gateway Settings — Framique admin" },
      { property: "og:description", content: "Configure OpenRouter Nvidia Nemotron models and dynamic key rotation." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AiSettingsPage,
});

function AiSettingsPage() {
  const initial = Route.useLoaderData();
  const { t } = useLang();

  const [activeSlot, setActiveSlot] = useState(initial.activeSlot);
  const [maskedKey, setMaskedKey] = useState(initial.maskedKey);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [chatModel, setChatModel] = useState(initial.chatModel);
  const [fallbackChatModel, setFallbackChatModel] = useState(initial.fallbackChatModel);
  const [embeddingModel, setEmbeddingModel] = useState(initial.embeddingModel);
  const [gatewayUrl, setGatewayUrl] = useState(initial.gatewayUrl);

  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<{ ok: boolean; latencyMs?: number; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const testProbe = useServerFn(testAiGatewayProbeFn);
  const updateConfig = useServerFn(updateAiGatewayConfigFn);

  async function handleTestProbe() {
    const keyToTest = apiKeyInput.trim() || initial.maskedKey;
    setProbing(true);
    setProbeResult(null);
    try {
      const res = await testProbe({
        data: {
          apiKey: keyToTest,
          chatModel,
          embeddingModel,
        },
      });
      setProbeResult(res);
    } catch (err) {
      setProbeResult({ ok: false, error: (err as Error).message });
    } finally {
      setProbing(false);
    }
  }

  async function handleSaveConfig() {
    if (!apiKeyInput.trim()) {
      setSaveMessage(t("Please enter a new API key to rotate or update.", "নতুন এপিআই কি দিন।"));
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await updateConfig({
        data: {
          apiKey: apiKeyInput.trim(),
          chatModel,
          fallbackChatModel,
          embeddingModel,
          gatewayUrl,
        },
      });

      if (res.ok) {
        setActiveSlot(res.activeSlot || "red");
        setMaskedKey(`${apiKeyInput.trim().slice(0, 8)}...${apiKeyInput.trim().slice(-4)}`);
        setApiKeyInput("");
        setSaveMessage(t("Successfully hot-swapped and promoted dynamic slot!", "সফলভাবে হট-সোয়াপ ও প্রমোট সম্পন্ন হয়েছে!"));
      } else {
        setSaveMessage(`Promotion failed: ${res.error}`);
      }
    } catch (err) {
      setSaveMessage(`Error: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell>
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              {t("AI Gateway & Nemotron Settings", "এআই গেটওয়ে ও নেমোট্রন সেটিংস")}
            </h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                activeSlot === "blue" ? "bg-blue-100 text-blue-800" : "bg-red-100 text-red-800"
              }`}
            >
              Slot: {activeSlot}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            {t(
              "Zero-downtime hot-swappable OpenRouter key management and model fallback routing via dynamic configuration vault.",
              "ডাইনামিক কনফিগ ভল্টের মাধ্যমে ওপেনরাউটার কি এবং নেমোট্রন মডেল কনফিগার করুন।",
            )}
          </p>
        </div>

        <div className="space-y-6">
          {/* Active Status Card */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              {t("Active AI Credentials Vault", "সক্রিয় এআই ভল্ট অবস্থা")}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-gray-500 block text-xs font-medium uppercase mb-1">
                  {t("Masked Active Key", "সক্রিয় কি")}
                </span>
                <code className="text-gray-800 font-mono text-xs">{maskedKey}</code>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-gray-500 block text-xs font-medium uppercase mb-1">
                  {t("Gateway Endpoint", "গেটওয়ে এন্ডপয়েন্ট")}
                </span>
                <code className="text-gray-800 font-mono text-xs">{gatewayUrl}</code>
              </div>
            </div>
          </div>

          {/* Model Configuration Form */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-5">
            <h2 className="text-base font-semibold text-gray-900">
              {t("Model Architecture & Credentials", "মডেল আর্কিটেকচার ও কি রোটেশন")}
            </h2>

            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
                {t("Primary Chat Model", "প্রধান চ্যাট মডেল")}
              </label>
              <input
                type="text"
                value={chatModel}
                onChange={(e) => setChatModel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <span className="text-xs text-gray-400 mt-1 block">
                Default: nvidia/nemotron-3-ultra-550b-a55b:free
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
                {t("Fallback Chat Model", "ফলব্যাক চ্যাট মডেল")}
              </label>
              <input
                type="text"
                value={fallbackChatModel}
                onChange={(e) => setFallbackChatModel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <span className="text-xs text-gray-400 mt-1 block">
                Default: nvidia/nemotron-3.5-lightning:free (Used when primary returns 429/502/timeout)
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
                {t("Dense Embedding Model", "ডেনস এম্বেডিং মডেল")}
              </label>
              <input
                type="text"
                value={embeddingModel}
                onChange={(e) => setEmbeddingModel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <span className="text-xs text-gray-400 mt-1 block">
                Default: nvidia/llama-nemotron-embed-vl-1b-v2:free
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
                {t("New OpenRouter API Key (to Rotate)", "নতুন ওপেনরাউটার কি")}
              </label>
              <input
                type="password"
                placeholder="sk-or-v1-..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <span className="text-xs text-gray-400 mt-1 block">
                Keys are never leaked in client bundles or public logs.
              </span>
            </div>

            {/* Probe Feedback Badge */}
            {probeResult && (
              <div
                className={`p-3 rounded-lg text-xs font-medium border flex items-center justify-between ${
                  probeResult.ok
                    ? "bg-green-50 border-green-200 text-green-800"
                    : "bg-red-50 border-red-200 text-red-800"
                }`}
              >
                <span>
                  {probeResult.ok
                    ? `Health Probe PASSED (${probeResult.latencyMs}ms) — Provider is healthy.`
                    : `Health Probe FAILED: ${probeResult.error}`}
                </span>
              </div>
            )}

            {saveMessage && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                {saveMessage}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={handleTestProbe}
                disabled={probing}
                className="px-4 py-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {probing ? t("Testing Probe...", "পরীক্ষা করা হচ্ছে...") : t("Test OpenRouter Probe", "প্রোব টেস্ট করুন")}
              </button>

              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={saving}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
              >
                {saving ? t("Promoting Slot...", "প্রমোট করা হচ্ছে...") : t("Hot-Swap & Promote Slot", "হট-সোয়াপ ও প্রমোট")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
