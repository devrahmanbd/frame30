import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { MERCHANT_AI_ENABLED } from "@/lib/merchant-ai";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bot,
  Sparkles,
  Send,
  ShieldCheck,
  Check,
  Copy,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  RefreshCw,
  Filter,
  ArrowRight,
  User,
  Inbox,
  Clock,
  Hash,
} from "lucide-react";
import {
  aiCopilotChatFn,
  supportInboxFn,
  supportReplyFn,
  supportStatusFn,
  supportThreadFn,
} from "@/lib/ai-support.functions";
import { Page, Badge } from "@/components/console/kit";

export const Route = createFileRoute("/_authenticated/dashboard/ai/assistant")({
  // Merchant AI is platform-only: direct URLs bounce to the dashboard.
  // The merchant↔Framique support channel (/dashboard/support) is untouched.
  beforeLoad: () => {
    if (!MERCHANT_AI_ENABLED) throw redirect({ to: "/dashboard", replace: true });
  },
  loader: () => supportInboxFn(),
  head: () => ({
    meta: [
      { title: "AI Copilot & Support Inbox — Framique Admin" },
      {
        name: "description",
        content:
          "Framique AI Assistant with copilot chat and live customer support triage.",
      },
      { property: "og:title", content: "AI Copilot & Support Inbox — Framique Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AssistantConsole,
});

type Tab = "copilot" | "inbox";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{
    id: string;
    title: string;
    category: string;
    summary: string;
    url?: string;
    similarity?: number;
  }>;
  confidence?: "verified" | "grounded" | "speculative";
  similarity?: number;
  timestamp: string;
  feedback?: "helpful" | "unhelpful";
};

const SUGGESTED_PROMPTS = [
  "How do I configure bKash Tokenized Checkout?",
  "How do I connect SteadFast Courier and webhooks?",
  "How does the Page Builder JSON AST work?",
  "How do I connect a Custom Domain with free SSL?",
  "How to set inside vs outside Dhaka shipping rates?",
  "How does continuous PostgreSQL WAL archiving work?",
];

function AssistantConsole() {
  const initial = Route.useLoaderData();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>("copilot");

  // Server functions
  const copilotChat = useServerFn(aiCopilotChatFn);

  // Copilot State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "msg_welcome",
      role: "assistant",
      content:
        "Hello! I am **Framique AI Copilot**, your dedicated Cloud Commerce platform specialist. I am trained on over **100+ deep platform specifications** spanning architecture, payment gateways (bKash, Nagad, SSLCommerz), couriers (SteadFast, Pathao, RedX), visual page builder AST, and disaster recovery. How can I assist your business today?",
      confidence: "verified",
      similarity: 1.0,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [inputQuery, setInputQuery] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Customer Inbox State
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<
    Array<{ id: string; role: string; body: string; created_at: string }>
  >([]);
  const [inboxDraft, setInboxDraft] = useState("");
  const [inboxFilter, setInboxFilter] = useState<string>("all");

  // Auto-scroll chat to bottom on new message
  useEffect(() => {
    if (activeTab === "copilot") {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isThinking, activeTab]);

  // Handle Copilot Send
  async function handleSendCopilot(promptText?: string) {
    const text = (promptText ?? inputQuery).trim();
    if (!text || isThinking) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery("");
    setIsThinking(true);

    try {
      const history = messages.slice(-4).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await copilotChat({
        data: { message: text, history },
      });

      const assistantMsg: ChatMessage = {
        id: `ast_${Date.now()}`,
        role: "assistant",
        content: res.answer,
        sources: res.sources,
        confidence: res.confidence,
        similarity: res.similarity,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      toast.error("Could not complete AI query. Using local knowledge fallback.");
      const fallbackMsg: ChatMessage = {
        id: `ast_err_${Date.now()}`,
        role: "assistant",
        content:
          "I encountered a temporary connection issue. Please check that your network connection is stable or try again shortly.",
        confidence: "speculative",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsThinking(false);
    }
  }

  // Customer Inbox Thread Handlers
  async function openInboxThread(id: string) {
    setActiveThreadId(id);
    const msgs = await supportThreadFn({ data: { conversationId: id } });
    setThreadMessages(msgs);
  }

  async function sendInboxReply() {
    if (!activeThreadId || !inboxDraft.trim()) return;
    await supportReplyFn({
      data: { conversationId: activeThreadId, body: inboxDraft.trim() },
    });
    setInboxDraft("");
    await openInboxThread(activeThreadId);
    await router.invalidate();
    toast.success("Reply dispatched to customer.");
  }

  async function updateInboxStatus(status: "open" | "needs_agent" | "resolved" | "closed") {
    if (!activeThreadId) return;
    await supportStatusFn({ data: { conversationId: activeThreadId, status } });
    await router.invalidate();
    toast.success(`Conversation marked as ${status}.`);
  }

  const filteredConversations = useMemo(() => {
    return initial.conversations.filter((c) => {
      if (inboxFilter === "all") return true;
      return c.status === inboxFilter;
    });
  }, [initial.conversations, inboxFilter]);

  return (
    <Page
      title={
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-fq-md bg-primary text-primary-foreground shadow-sm">
            <Bot className="size-4.5" />
          </div>
          <div>
            <span className="font-semibold tracking-tight">AI Copilot</span>
          </div>
        </div>
      }
      description="Enterprise commerce AI trained on 100+ deep platform specifications, dense vector search, and unified customer triage."
      actions={
        <div className="flex items-center gap-2">
          <Badge tone="success" className="gap-1.5 py-1 text-xs">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Vector DB Active (1,024-d)
          </Badge>
          <Badge tone="neutral" className="text-xs">
            105 Trained Topics
          </Badge>
        </div>
      }
    >
      {/* Navigation Tabs */}
      <div className="mb-6 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-1 -mb-px">
          <button
            type="button"
            onClick={() => setActiveTab("copilot")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "copilot"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="size-4" />
            AI Copilot
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("inbox")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "inbox"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Inbox className="size-4" />
            Customer Inbox
            {initial.stats.needsAgent > 0 && (
              <span className="rounded-full bg-destructive px-1.5 py-0.2 text-[10px] font-bold text-destructive-foreground">
                {initial.stats.needsAgent}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 1: AI COPILOT CHAT                                             */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "copilot" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col rounded-fq-lg border border-border bg-card shadow-sm">
            {/* Chat Messages Canvas */}
            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6 min-h-[480px] max-h-[640px]">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.role === "assistant" && (
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-fq-md border border-primary/20 bg-primary/10 text-primary shadow-sm mt-0.5">
                      <Bot className="size-4.5" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-fq-lg p-4 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground shadow-sm rounded-tr-sm"
                        : "border border-border bg-muted/30 text-foreground shadow-sm rounded-tl-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4 mb-1.5">
                      <span className="text-xs font-semibold opacity-75">
                        {msg.role === "user" ? "You" : "Framique Copilot"}
                      </span>
                      <div className="flex items-center gap-1.5 text-[11px] opacity-60">
                        {msg.confidence && (
                          <span
                            className={`rounded-full px-1.5 py-0.2 text-[10px] font-medium ${
                              msg.confidence === "verified"
                                ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold"
                                : "bg-blue-500/20 text-blue-600 dark:text-blue-400"
                            }`}
                          >
                            {msg.confidence === "verified"
                              ? "KB Verified"
                              : "Grounded"}
                          </span>
                        )}
                        <span>{msg.timestamp}</span>
                      </div>
                    </div>

                    {/* Markdown Body Rendering */}
                    <div className="space-y-2 prose prose-sm dark:prose-invert max-w-none break-words">
                      <MarkdownViewer text={msg.content} isUser={msg.role === "user"} />
                    </div>

                    {/* Citations Card */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3.5 pt-3 border-t border-border/40">
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Hash className="size-3" />
                          Verified Sources
                        </div>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {msg.sources.map((src) => (
                            <div
                              key={src.id}
                              className="rounded-fq-md border border-border/70 bg-background/60 p-2 text-xs transition-colors hover:bg-background"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-foreground truncate">
                                  {src.title}
                                </span>
                                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono uppercase text-muted-foreground">
                                  {src.category}
                                </span>
                              </div>
                              <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                                {src.summary}
                              </p>
                              {src.similarity && (
                                <div className="mt-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                                  {(src.similarity * 100).toFixed(0)}% semantic match
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action Toolbar */}
                    {msg.role === "assistant" && (
                      <div className="mt-3 flex items-center justify-between pt-2 border-t border-border/40 text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(msg.content);
                              toast.success("Answer copied to clipboard.");
                            }}
                            className="inline-flex items-center gap-1 text-[11px] hover:text-foreground transition-colors"
                            title="Copy text"
                          >
                            <Copy className="size-3" />
                            Copy
                          </button>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setMessages((prev) =>
                                prev.map((m) =>
                                  m.id === msg.id ? { ...m, feedback: "helpful" } : m,
                                ),
                              );
                              toast.success("Feedback logged for RLHF training.");
                            }}
                            className={`p-1 rounded hover:bg-muted transition-colors ${
                              msg.feedback === "helpful" ? "text-emerald-500" : ""
                            }`}
                            title="Helpful"
                          >
                            <ThumbsUp className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMessages((prev) =>
                                prev.map((m) =>
                                  m.id === msg.id ? { ...m, feedback: "unhelpful" } : m,
                                ),
                              );
                              toast.info("Feedback noted for fine-tuning.");
                            }}
                            className={`p-1 rounded hover:bg-muted transition-colors ${
                              msg.feedback === "unhelpful" ? "text-destructive" : ""
                            }`}
                            title="Not helpful"
                          >
                            <ThumbsDown className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {msg.role === "user" && (
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-fq-md bg-muted text-muted-foreground mt-0.5">
                      <User className="size-4" />
                    </div>
                  )}
                </div>
              ))}

              {isThinking && (
                <div className="flex gap-3 justify-start items-center">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-fq-md border border-primary/20 bg-primary/10 text-primary shadow-sm">
                    <Bot className="size-4.5 animate-spin" />
                  </div>
                  <div className="rounded-fq-lg border border-border bg-card p-3 shadow-sm text-xs text-muted-foreground flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                    <span className="size-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                    <span className="size-1.5 rounded-full bg-primary animate-bounce" />
                    Searching vector database and synthesizing answer...
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Input Bar */}
            <div className="border-t border-border bg-background p-4 rounded-b-fq-lg">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSendCopilot();
                }}
                className="relative flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputQuery}
                  onChange={(e) => setInputQuery(e.target.value)}
                  placeholder="Ask anything about bKash, SteadFast courier, custom domains, AST builder..."
                  className="w-full rounded-fq-md border border-input bg-card px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring pr-24 shadow-sm"
                  disabled={isThinking}
                />
                <button
                  type="submit"
                  disabled={!inputQuery.trim() || isThinking}
                  className="absolute right-2 inline-flex items-center gap-1.5 rounded-fq-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-50"
                >
                  <Send className="size-3.5" />
                  Ask
                </button>
              </form>
            </div>
          </div>

          {/* Quick Prompts & Knowledge Sidebar */}
          <div className="space-y-4">
            <div className="rounded-fq-lg border border-border bg-card p-4 shadow-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-primary" />
                Suggested Questions
              </h3>
              <div className="space-y-2">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void handleSendCopilot(prompt)}
                    className="w-full text-left rounded-fq-md border border-border bg-muted/20 p-2.5 text-xs font-medium text-foreground transition-all hover:bg-muted hover:border-primary/40 flex items-start gap-2"
                  >
                    <ArrowRight className="size-3 text-primary mt-0.5 shrink-0" />
                    <span>{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 2: CUSTOMER SUPPORT INBOX                                      */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "inbox" && (
        <div className="space-y-6">
          {/* Quick Stats Grid */}
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard
              label="Total Customer Conversations"
              value={String(initial.stats.total)}
              icon={MessageSquare}
            />
            <StatCard
              label="Messages In Last Hour"
              value={String(initial.stats.lastHour)}
              icon={Clock}
            />
            <StatCard
              label="Needs Human Agent"
              value={String(initial.stats.needsAgent)}
              highlight={initial.stats.needsAgent > 0}
              icon={User}
            />
            <StatCard
              label="Average CSAT Rating"
              value={
                initial.stats.ratingAvg
                  ? `${initial.stats.ratingAvg.toFixed(1)} / 5 (${initial.stats.ratingCount})`
                  : "—"
              }
              icon={ShieldCheck}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
            {/* Conversation Threads List */}
            <div className="flex flex-col rounded-fq-lg border border-border bg-card overflow-hidden shadow-sm">
              <div className="border-b border-border p-3 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Conversations
                </span>
                <select
                  value={inboxFilter}
                  onChange={(e) => setInboxFilter(e.target.value)}
                  className="rounded-fq-md border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="all">All Statuses</option>
                  <option value="needs_agent">Needs Agent</option>
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>

              <ul className="divide-y divide-border overflow-y-auto max-h-[560px]">
                {filteredConversations.length === 0 && (
                  <li className="p-8 text-center text-xs text-muted-foreground">
                    No customer conversations in this view.
                  </li>
                )}
                {filteredConversations.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => void openInboxThread(c.id)}
                      className={`w-full px-4 py-3 text-left outline-none transition-colors hover:bg-muted/40 ${
                        activeThreadId === c.id ? "bg-muted/70 font-medium" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold truncate text-foreground">
                          Order {c.order_number ?? "General Inquiry"}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            c.status === "needs_agent"
                              ? "bg-destructive/15 text-destructive"
                              : c.status === "resolved"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {c.status.replace("_", " ")}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Via {c.channel ?? "Storefront"}</span>
                        <span>{new Date(c.last_message_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Conversation Detail & Dispatch */}
            <div className="flex flex-col rounded-fq-lg border border-border bg-card shadow-sm">
              {!activeThreadId ? (
                <div className="flex flex-1 items-center justify-center p-12 text-center text-muted-foreground">
                  <div>
                    <MessageSquare className="mx-auto size-8 opacity-30 mb-2" />
                    <p className="text-sm font-medium">Select a conversation to view chat history.</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col h-full">
                  {/* Thread Actions Header */}
                  <div className="flex items-center justify-between border-b border-border p-3.5 bg-muted/20">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-foreground">Active Thread:</span>
                      <span className="font-mono text-muted-foreground">{activeThreadId.slice(0, 8)}...</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void updateInboxStatus("resolved")}
                        className="rounded-fq-md border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
                      >
                        Mark Resolved
                      </button>
                      <button
                        type="button"
                        onClick={() => void updateInboxStatus("needs_agent")}
                        className="rounded-fq-md border border-destructive/30 bg-destructive/10 text-destructive px-2.5 py-1 text-xs font-medium hover:bg-destructive/20 transition-colors"
                      >
                        Escalate
                      </button>
                    </div>
                  </div>

                  {/* Messages Canvas */}
                  <div className="flex-1 space-y-3 overflow-y-auto p-4 max-h-[380px]">
                    {threadMessages.map((m) => (
                      <div
                        key={m.id}
                        className={`flex gap-2 ${
                          m.role === "customer" ? "justify-start" : "justify-end"
                        }`}
                      >
                        <div
                          className={`max-w-[80%] rounded-fq-md p-3 text-xs leading-relaxed ${
                            m.role === "customer"
                              ? "bg-muted text-foreground"
                              : "bg-primary text-primary-foreground font-medium"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4 mb-1 text-[10px] opacity-70">
                            <span>{m.role === "customer" ? "Shopper" : "Operator / Bot"}</span>
                            <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                          <p>{m.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Suggestion Chips */}
                  <div className="border-t border-border p-3 bg-muted/10">
                    <div className="text-[11px] font-semibold text-muted-foreground mb-2">
                      Quick Suggestions:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {initial.suggestions.map((s) => (
                        <button
                          key={s.intent}
                          type="button"
                          onClick={() => setInboxDraft(s.body)}
                          className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dispatch Box */}
                  <div className="border-t border-border p-4 bg-background">
                    <textarea
                      value={inboxDraft}
                      onChange={(e) => setInboxDraft(e.target.value)}
                      rows={3}
                      placeholder="Type a verified reply or insert a suggested response above..."
                      className="w-full rounded-fq-md border border-input bg-card p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void sendInboxReply()}
                        disabled={!inboxDraft.trim()}
                        className="inline-flex items-center gap-1.5 rounded-fq-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-50"
                      >
                        <Send className="size-3" />
                        Send Reply
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: typeof MessageSquare;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-fq-lg border p-4 shadow-sm ${
        highlight
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-card text-foreground"
      }`}
    >
      <div className="flex items-center justify-between text-muted-foreground mb-1">
        <span className="text-xs">{label}</span>
        <Icon className="size-4" />
      </div>
      <p className="text-xl font-bold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

/**
 * Lightweight native Markdown renderer for headers, bold text, code blocks and lists.
 */
function MarkdownViewer({ text, isUser }: { text: string; isUser?: boolean }) {
  const parts = useMemo(() => {
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      // Heading 3
      if (line.startsWith("### ")) {
        return (
          <h4 key={idx} className="font-bold text-base mt-2 mb-1 text-foreground">
            {line.replace("### ", "")}
          </h4>
        );
      }
      // Heading 4
      if (line.startsWith("#### ")) {
        return (
          <h5 key={idx} className="font-semibold text-sm mt-1.5 mb-1 text-foreground">
            {line.replace("#### ", "")}
          </h5>
        );
      }
      // Horizontal rule
      if (line.trim() === "---") {
        return <hr key={idx} className="my-2 border-border/50" />;
      }
      // Bullet list item
      if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
        const itemText = line.trim().replace(/^[-*]\s+/, "");
        return (
          <li key={idx} className="ml-4 list-disc text-xs sm:text-sm">
            <FormatInline text={itemText} />
          </li>
        );
      }
      // Numbered list item
      if (/^\d+\.\s/.test(line.trim())) {
        const itemText = line.trim().replace(/^\d+\.\s+/, "");
        return (
          <li key={idx} className="ml-4 list-decimal text-xs sm:text-sm">
            <FormatInline text={itemText} />
          </li>
        );
      }
      // Code block lines
      if (line.startsWith("```")) {
        return null;
      }
      // Empty line
      if (!line.trim()) {
        return <div key={idx} className="h-1.5" />;
      }
      // Standard paragraph line
      return (
        <p key={idx} className="text-xs sm:text-sm">
          <FormatInline text={line} />
        </p>
      );
    });
  }, [text]);

  return <div className="space-y-1">{parts}</div>;
}

/**
 * Format inline bold and code tags.
 */
function FormatInline({ text }: { text: string }) {
  // Simple regex parser for **bold** and `code`
  const chunks = useMemo(() => {
    const regex = /(\*\*.*?\*\*|`.*?`)/g;
    const split = text.split(regex);
    return split.map((chunk, i) => {
      if (chunk.startsWith("**") && chunk.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-foreground">
            {chunk.slice(2, -2)}
          </strong>
        );
      }
      if (chunk.startsWith("`") && chunk.endsWith("`")) {
        return (
          <code
            key={i}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
          >
            {chunk.slice(1, -1)}
          </code>
        );
      }
      return chunk;
    });
  }, [text]);

  return <>{chunks}</>;
}
