import { createServerFn } from "@tanstack/react-start";

/**
 * Public, unauthenticated: the docs are public, so the answer over them is
 * too. Retrieval + the model call live in `docs-ai.server.ts` so the API key
 * never enters a module the client can reach.
 */
export const askDocsAi = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const input = data as { question?: unknown; version?: unknown; history?: unknown };
    const question = typeof input?.question === "string" ? input.question.trim() : "";
    if (question.length < 2) throw new Error("Ask a question first.");
    const history = Array.isArray(input?.history)
      ? (input.history as Array<{ role?: unknown; content?: unknown }>)
          .filter(
            (turn) =>
              (turn?.role === "user" || turn?.role === "assistant") &&
              typeof turn?.content === "string",
          )
          .map((turn) => ({
            role: turn.role as "user" | "assistant",
            content: String(turn.content).slice(0, 2000),
          }))
      : [];
    return {
      question: question.slice(0, 500),
      version: typeof input?.version === "string" ? input.version : undefined,
      history,
    };
  })
  .handler(async ({ data }) => {
    const { answerDocsQuestion } = await import("./docs-ai.server");
    const { isDocVersion } = await import("./docs");
    return answerDocsQuestion({
      question: data.question,
      ...(isDocVersion(data.version) ? { version: data.version } : {}),
      history: data.history,
    });
  });
