/**
 * Phase 12 — `/admin/content/editor?kind=page|post&id=<uuid>` (omit `id` for new).
 *
 * Renders the full-screen `EditorShell` without `<AdminShell>`: the console
 * sidebar/topbar are gone while editing, exactly like Gutenberg. The route is
 * hidden from navigation; lists deep-link here via `content-links.ts`.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { EditorShell } from "@/components/admin/editor/EditorShell";
import { consoleRoute } from "@/lib/console-routes";

const searchSchema = z.object({
  kind: z.enum(["page", "post"]).catch("page"),
  id: z.string().uuid().optional().catch(undefined),
  editor: z.enum(["classic", "builder"]).optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/admin/content/editor")({
  staticData: consoleRoute({ permission: "marketing.read", navHidden: true, chrome: false }),
  validateSearch: (search) => searchSchema.parse(search),
  head: ({ match }) => ({
    meta: [
      { title: `${match.search.kind === "page" ? "Edit page" : "Edit post"} — Framique Admin` },
      { name: "description", content: "Full-screen editor with autosave, revisions and pre-publish checks." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditorRoute,
});

function EditorRoute() {
  const { kind, id, editor } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <EditorShell
      key={`${kind}:${id ?? "new"}`}
      kind={kind}
      id={id ?? null}
      forceEditor={editor ?? null}
      listHref={kind === "page" ? "/admin/content/pages" : "/admin/content/posts"}
      onCreated={(newId) => void navigate({ to: "/admin/content/editor", search: { kind, id: newId }, replace: true })}
    />
  );
}
