/**
 * Phase 12 — `/dashboard/content/editor?kind=page|post&id=<uuid>` (omit `id` for new).
 *
 * Renders the full-screen `EditorShell` without `<AdminShell>`: the console
 * sidebar/topbar are gone while editing, exactly like Gutenberg. The route is
 * hidden from navigation; lists deep-link here via `content-links.ts`.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { EditorShell } from "@/components/admin/editor/EditorShell";
import { consoleRoute } from "@/lib/console-routes";
import { builderWorkspaceFn } from "@/lib/builder-workspace.functions";
import {
  buildEditorExtensionRegistry,
  resolveEditorDevThemeBinding,
} from "@/lib/editor/editor-registry";
import { pluginListFn } from "@/lib/plugins.functions";

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

  /**
   * Frame30 one-registry provisioning for the real editor path (mirrors the
   * sibling `dashboard/builder.tsx` lane through the shared
   * `editor-registry` provider — this file builds nothing itself).
   * Server-authorized installed plugins for THIS tenant (`pluginListFn`)
   * plus the server-projected workspace theme (`builderWorkspaceFn`: the
   * approved ACTIVE release's `approvedDevManifest` + `devThemeBinding`
   * inputs, absent unless the approval gates passed) feed ONE registry and
   * ONE binding. Either query failing (e.g. a role without
   * `plugins.read`/`themes.read`) fail-closes to plugins-only + absent
   * binding — the tray simply offers fewer widgets, never foreign ones.
   * Tenant isolation holds because both inputs are server-scoped to this
   * merchant; nothing here touches the shared singleton.
   */
  const loadPlugins = useServerFn(pluginListFn);
  const pluginsQuery = useQuery({
    queryKey: ["editor", "plugins"],
    queryFn: () => loadPlugins({}),
    staleTime: 60_000,
    retry: 1,
  });
  const loadWorkspace = useServerFn(builderWorkspaceFn);
  const workspaceQuery = useQuery({
    queryKey: ["editor", "workspace-theme"],
    queryFn: () => loadWorkspace({}),
    staleTime: 30_000,
    retry: 1,
  });
  const authorizedPlugins = useMemo(
    () => pluginsQuery.data?.plugins ?? [],
    [pluginsQuery.data],
  );
  const workspaceTheme = workspaceQuery.data?.theme;
  /**
   * Frame30 one-registry: exactly ONE `buildEditorExtensionRegistry` call
   * per route render feeds EVERY downstream path (tray discovery,
   * inspector, canvas, preview, save, publish) through the same instance —
   * the shell/route never build a second registry. `editorThemeKey` is the
   * exact `themeKey` input below, threaded as `activeThemeKey` so canvas /
   * preview presentation resolves keyed (owning-theme defs are
   * `theme:<sourceKey>/…`); absent keeps explicit unkeyed fail-closed.
   */
  const editorRegistry = useMemo(
    () =>
      buildEditorExtensionRegistry({
        installedPlugins: authorizedPlugins,
        themeKey: workspaceTheme?.sourceKey ?? null,
        approvedDevManifest: (
          workspaceTheme as unknown as
            { approvedDevManifest?: unknown } | undefined
        )?.approvedDevManifest,
        isActive: workspaceTheme?.isActive,
      }),
    [authorizedPlugins, workspaceTheme],
  );
  const editorThemeKey =
    typeof workspaceTheme?.sourceKey === "string" &&
    workspaceTheme.sourceKey.trim()
      ? workspaceTheme.sourceKey.trim()
      : null;
  const editorDevThemeBinding = useMemo(
    () =>
      resolveEditorDevThemeBinding(
        (workspaceTheme as unknown as { devThemeBinding?: unknown } | undefined)
          ?.devThemeBinding,
      ),
    [workspaceTheme],
  );

  return (
    <EditorShell
      key={`${kind}:${id ?? "new"}`}
      kind={kind}
      id={id ?? null}
      forceEditor={forced}
      extensionRegistry={editorRegistry}
      devThemeBinding={editorDevThemeBinding ?? null}
      activeThemeKey={editorThemeKey}
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
