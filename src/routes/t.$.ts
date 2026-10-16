/**
 * Level B — versioned theme asset delivery (`/t/<themeId>/<version>/<path>`).
 *
 * Public by design (a sandboxed frame `src` carries no bearer token).
 * Authorization is the fingerprinted-release verification in
 * `@/lib/themes.server` (`resolveDevThemeAsset` — read that module header
 * for the trust chain): only bytes hashing to an approval-bound release
 * file entry are served, with immutable caching. There is intentionally no
 * session check here, mirroring the `/pkg/` + media/font routes.
 *
 * `index.html` is the one synthesized exception: it is not an assembled
 * output, so it is built on demand by `@/lib/dev-theme-document`
 * (`buildDevThemeDocument` — approved releases ONLY, hash-pinned tags, CSP
 * meta mirroring `themeFrameCSP`, no inline code), and only served after
 * EVERY referenced asset re-proves through `resolveDevThemeAsset` (a stored
 * row that drifts from its pinned hash 404s the whole document).
 *
 * CORS: every 200 below carries `access-control-allow-origin: *`. The frame
 * is sandboxed without `allow-same-origin`, so its origin is opaque and
 * `<script type="module">` subresources fetch in CORS mode — without this
 * the real frame could never execute (measured in the Level B execution
 * spec). Safe: these bytes are public by design (hash-pinned, bearer-free).
 *
 * Fail-closed throughout: unparseable splats, unknown versions, ambiguous
 * releases, missing entries, tampered bytes/maps/approvals, refused kinds,
 * unapproved documents, and oversized rows all
 * 404 with `no-store` (never an immutable directive on a refusal, so a
 * refusal can never poison a shared cache).
 */
import { createFileRoute } from "@tanstack/react-router";

const NOT_FOUND = { "cache-control": "no-store" };

type LooseDb = {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): Promise<{ data: unknown; error: unknown }>;
    };
  };
};

export const Route = createFileRoute("/t/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const {
          parseDevThemeAssetPath,
          devThemeReleaseRowName,
          devThemeApprovalRowName,
          resolveDevThemeAsset,
        } = await import("@/lib/themes.server");
        const { publicClient } = await import("@/lib/pricing.server");

        const splat = (params as { _splat?: string })._splat ?? "";
        const requested = parseDevThemeAssetPath(splat);
        if (!requested) {
          return new Response("not_found", { status: 404, headers: NOT_FOUND });
        }

        // Exact-name reads only (no prefix scans): the descriptor, the
        // approval snapshot, and the addressed file. Cross-merchant rows
        // with the same names are resolved by hash verification inside
        // `resolveDevThemeAsset` (ambiguity refuses), not by scoping here —
        // the URL is merchant-free by contract. The document lane
        // (`index.html`) reads only the descriptor + approval snapshot, then
        // re-proves each referenced asset by exact name below.
        const db = publicClient() as unknown as LooseDb;
        const namespace = `dev-themes/${requested.themeId}/${requested.version}`;
        const [approvals, maps, assets] = await Promise.all([
          db
            .from("theme_assets")
            .select("merchant_id, name, kind, content, bytes")
            .eq(
              "name",
              devThemeApprovalRowName(requested.themeId, requested.version),
            ),
          db
            .from("theme_assets")
            .select("merchant_id, name, kind, content, bytes")
            .eq(
              "name",
              devThemeReleaseRowName(requested.themeId, requested.version),
            ),
          requested.assetPath === "index.html"
            ? Promise.resolve({ data: [], error: null })
            : db
                .from("theme_assets")
                .select("merchant_id, name, kind, content, bytes")
                .eq("name", `${namespace}/${requested.assetPath}`),
        ]);

        if (requested.assetPath === "index.html") {
          const { buildDevThemeDocument } =
            await import("@/lib/dev-theme-document");
          const origin = new URL(request.url).origin;
          const doc = buildDevThemeDocument({
            themeId: requested.themeId,
            version: requested.version,
            assetOrigin: origin,
            approvalRows: (approvals as { data: unknown }).data,
            mapRows: (maps as { data: unknown }).data,
          });
          if (doc.status === 404) {
            return new Response("not_found", {
              status: 404,
              headers: NOT_FOUND,
            });
          }
          // Byte leg: every referenced asset must STILL verify through the
          // real per-file verifier (hash assertion against the fingerprinted
          // release) — a drifted row 404s the whole document, so the frame
          // can never load unapproved bytes via a stale-but-bound map.
          for (const ref of doc.refs) {
            const rows = await db
              .from("theme_assets")
              .select("merchant_id, name, kind, content, bytes")
              .eq("name", `${namespace}/${ref}`);
            const proof = resolveDevThemeAsset(
              { ...requested, assetPath: ref },
              (approvals as { data: unknown }).data,
              (maps as { data: unknown }).data,
              (rows as { data: unknown }).data,
            );
            if (proof.status === 404) {
              return new Response("not_found", {
                status: 404,
                headers: NOT_FOUND,
              });
            }
          }
          return new Response(doc.body, { headers: doc.headers });
        }

        const outcome = resolveDevThemeAsset(
          requested,
          (approvals as { data: unknown }).data,
          (maps as { data: unknown }).data,
          (assets as { data: unknown }).data,
        );
        if (outcome.status === 404) {
          return new Response("not_found", { status: 404, headers: NOT_FOUND });
        }
        // CORS for the opaque frame (see module header): module subresources
        // fetch in CORS mode, so the verified bytes carry `*`.
        return new Response(outcome.body, {
          headers: {
            ...outcome.headers,
            "access-control-allow-origin": "*",
          },
        });
      },
    },
  },
});
