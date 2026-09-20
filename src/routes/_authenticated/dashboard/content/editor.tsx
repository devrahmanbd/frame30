/**
 * Phase 12 — `/dashboard/content/editor?kind=page|post&id=<uuid>` (omit `id` for new).
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

export const Route = createFileRoute(
  "/_authenticated/dashboard/content/editor",
)({
  staticData: consoleRoute({
    permission: "marketing.read",
    navHidden: true,
    chrome: false,
  }),
  validateSearch: (search) => searchSchema.parse(search),
  head: ({ match }) => ({
    meta: [
      {
        title: `${match.search.kind === "page" ? "Edit page" : "Edit post"} — Framique Admin`,
      },
      {
        name: "description",
        content:
          "Full-screen editor with autosave, revisions and pre-publish checks.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditorRoute,
});

function EditorRoute() {
  const { kind, id, editor } = Route.useSearch();
  const navigate = useNavigate();
  // Pages are builder-only; a stale `?editor=classic` link can never open
  // the removed block surface for pages. Posts honour the query param.
  const forced = kind === "page" ? "builder" : (editor ?? null);
  return (
    <EditorShell
      key={`${kind}:${id ?? "new"}`}
      kind={kind}
      id={id ?? null}
      forceEditor={forced}
      listHref={
        kind === "page"
          ? "/dashboard/content/pages"
          : "/dashboard/content/posts"
      }
      onCreated={(newId) =>
        void navigate({
          to: "/dashboard/content/editor",
          search: {
            kind,
            id: newId,
            editor: kind === "page" ? "builder" : (editor ?? "classic"),
          },
          replace: true,
        })
      }
    />
  );
}
