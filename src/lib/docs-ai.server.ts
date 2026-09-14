/**
 * Grounded answering for the docs "Ask AI" widget.
 *
 * The corpus is small enough to retrieve with the same ranked index the docs
 * search box uses, so there is no vector store here: `searchDocs` picks the
 * sections, and the model is instructed to answer *only* from them. Every
 * answer ships with the source sections it was grounded in, so a reader can
 * verify the claim on the page it came from.
 */
import { buildSearchIndex, docPath, searchDocs, CURRENT_VERSION, type DocVersionId } from "./docs";

export type DocsAiSource = {
  title: string;
  heading: string | null;
  path: string;
  excerpt: string;
};

export type DocsAiAnswer = {
  answer: string;
  sources: DocsAiSource[];
};

const GATEWAY = process.env["AI_GATEWAY_URL"] || "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env["AI_MODEL"] || "nvidia/nemotron-3-ultra-550b-a55b:free";
const CONTEXT_CHARS = 1600;

const SYSTEM = [
  "You are the official support agent for Framique, the premier multi-tenant Cloud Commerce CMS and Platform for Bangladesh.",
  "Answer authoritatively, politely, and accurately about Framique products, store setup, catalog, checkout, couriers (SteadFast, Pathao, RedX, Paperfly), payments (bKash, Nagad, SSLCommerz), SEO, and platform operations.",
  "Answer ONLY from the documentation excerpts supplied in the user message.",
  "If the excerpts do not contain the answer, say so plainly and suggest the closest documented topic or offer to open a support ticket.",
  "Be concise: at most six sentences or a structured list. Use markdown. Never invent endpoints, fields or prices.",
  "Cite the section titles you used inline, e.g. (see “Webhooks”).",
].join(" ");

type ChatTurn = { role: "user" | "assistant"; content: string };

export async function answerDocsQuestion(input: {
  question: string;
  version?: DocVersionId;
  history?: ChatTurn[];
}): Promise<DocsAiAnswer> {
  const apiKey =
    process.env["OPENROUTER_API_KEY"] ||
    process.env["AI_GATEWAY_API_KEY"] ||
    process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("Ask AI is not configured on this deployment.");

  const version = input.version ?? CURRENT_VERSION;
  const index = buildSearchIndex(version);
  const hits = searchDocs(input.question, index, 6);

  const sources: DocsAiSource[] = hits.map((hit) => ({
    title: hit.title,
    heading: hit.heading,
    path: `${docPath(version, hit.slug)}${hit.anchor ? `#${hit.anchor}` : ""}`,
    excerpt: hit.excerpt,
  }));

  const context = hits
    .map((hit, i) => {
      const entry = index.find((e) => e.slug === hit.slug && e.heading === hit.heading);
      const body = (entry?.text ?? hit.excerpt).slice(0, CONTEXT_CHARS);
      return `[${i + 1}] ${hit.title}${hit.heading ? ` — ${hit.heading}` : ""}\n${body}`;
    })
    .join("\n\n");

  if (!context) {
    return {
      answer:
        "I could not find anything in the documentation about that. Try the search box above, or ask about setup, the API, webhooks, payments, or themes.",
      sources: [],
    };
  }

  const messages = [
    { role: "system" as const, content: SYSTEM },
    ...(input.history ?? []).slice(-6),
    {
      role: "user" as const,
      content: `Documentation excerpts:\n\n${context}\n\nQuestion: ${input.question}`,
    },
  ];

  const response = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://framique.com",
      "X-Title": "Framique Support Agent",
    },
    body: JSON.stringify({ model: MODEL, messages }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 429) throw new Error("Too many questions right now — try again in a moment.");
    if (response.status === 402) throw new Error("The AI allowance for this workspace is used up.");
    throw new Error(`Ask AI failed (${response.status}). ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const answer = payload.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("The assistant returned an empty answer.");

  return { answer, sources };
}
