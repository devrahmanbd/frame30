/// <reference types="vite/client" />
import { useEffect, useState } from "react";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { LanguageProvider } from "@/lib/i18n";
import { createIsomorphicFn } from "@tanstack/react-start";
import { readClientBootLang, type BootLang } from "@/lib/lang-boot";
import { readServerBootLang } from "@/lib/lang-boot.server";
import { FONT_PRELOAD } from "@/lib/web-vitals";
import appCss from "@/styles.css?url";
import { installClientErrorReporter } from "@/lib/client-error-reporter";
import { getCurrentNonce } from "@/lib/ssr-nonce";
import { isClientGatedPath } from "@/lib/boot-splash";
import { readServerBootSplash } from "@/lib/boot-splash.server";

// Phase 12 — one browser reporter for onerror + unhandled rejections. Runs at
// module scope on the client only; the server import is a no-op.
installClientErrorReporter();

/**
 * SSR reads the `Cookie:` header so the first paint is already in the visitor's
 * language (no post-hydration reflow, which was the real CLS source at 320px);
 * a client navigation recovers the same value locally with no round-trip.
 * `createIsomorphicFn` is what keeps the server-only request read out of the
 * browser bundle — a plain dynamic import in this file is rejected by import
 * protection and 500s the document.
 */
const resolveBootLang = createIsomorphicFn()
  .client((): BootLang => readClientBootLang())
  .server((): BootLang => readServerBootLang());

const resolveBootSplash = createIsomorphicFn()
  .client(
    (): boolean =>
      typeof window === "undefined"
        ? false
        : isClientGatedPath(window.location.pathname),
  )
  .server((): boolean => readServerBootSplash());

// Module-scope consumption flag for the one-shot splash (see RootDocument).
let bootSplashConsumed = false;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        // Phase 7.3 — both subsets are fetched up front so switching locale
        // never swaps in an unloaded face (CLS budget is 0.02).
        ...FONT_PRELOAD.origins.map((href) => ({
          rel: "preconnect",
          href,
          crossOrigin: "anonymous" as const,
        })),
        { rel: "preload", as: "style", href: FONT_PRELOAD.stylesheet },
        { rel: "stylesheet", href: FONT_PRELOAD.stylesheet },
        // One pairing for the whole product: Space Grotesk (display, headings,
        // metrics) + DM Sans (body and UI). Preloaded as well as linked — the
        // stylesheet is a third-party request on the critical path, and
        // discovering it late is what pushed the swap past the CLS measurement
        // window on slow 320px runs.
        {
          rel: "preload",
          as: "style",
          href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap",
        },
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "alternate icon", href: "/favicon.ico" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      ],
    }),
    /**
     * Resolves the document locale before the first byte of HTML (§10.6 CLS).
     *
     * On the server the `Cookie:` header is the only place a returning visitor's
     * language is visible, so it is read here and threaded into `<html lang>` and
     * the provider. On a client navigation the same value is recovered locally —
     * no server round-trip is added to in-app navigation.
     *
     * Fail-soft on purpose: any failure resolving a cosmetic preference degrades
     * to English rather than failing the document.
     */
    loader: (): { lang: BootLang } => ({ lang: resolveBootLang() }),
    component: RootDocument,
  },
);

function RootDocument() {
  // Boot splash shows exactly once per full document load on client-gated
  // routes — never on client-side navigations (which would flash it on
  // every dashboard click). First mount consumes the SSR-rendered splash;
  // later mounts skip it. Same-URL determinism keeps hydration matched.
  const [showSplash, setShowSplash] = useState(() => {
    // Server: derive purely from the request (module state is shared across
    // requests — never consult the consumption flag here).
    if (typeof window === "undefined") return resolveBootSplash();
    if (bootSplashConsumed) return false;
    bootSplashConsumed = true;
    return resolveBootSplash();
  });
  // Remove the server-rendered boot splash the moment React hydrates, so a
  // reload never sits on a white void (authenticated routes are client-gated
  // and would otherwise flash blank while the session check runs). If JS
  // fails entirely the splash stays — brand, not blankness.
  useEffect(() => {
    if (showSplash) {
      document.getElementById("fq-boot")?.remove();
      setShowSplash(false);
    }
  }, [showSplash]);
  // The router owns the QueryClient; the provider makes it reachable from
  // useQuery/useMutation in every route below.
  const { queryClient } = Route.useRouteContext();
  const { lang } = Route.useLoaderData();
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          nonce={typeof window === "undefined" ? getCurrentNonce() : undefined}
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var stored = localStorage.getItem("fq_public_theme");
                var theme = stored === "light" || stored === "dark" ? stored : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
                document.documentElement.setAttribute("data-theme", theme);
                if (theme === "dark") {
                  document.documentElement.classList.add("dark");
                } else {
                  document.documentElement.classList.remove("dark");
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body>
        {/* Boot splash: static, zero-JS brand cover for the reload gap on
            client-gated routes ONLY (public SSR pages stream content at
            once — a splash there would cover real pixels and hurt LCP).
            Inline styles on purpose — it must paint before any stylesheet
            or script arrives. Removed on hydration (see useEffect above). */}
        {showSplash ? (
        <div
          id="fq-boot"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            background: "#FFF1F3",
            color: "#0F172A",
            fontFamily:
              '"Space Grotesk","DM Sans",system-ui,-apple-system,sans-serif',
          }}
        >
          <div style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.5px" }}>
            Framique
          </div>
          <div
            style={{
              width: "120px",
              height: "3px",
              borderRadius: "999px",
              background: "rgba(24,119,242,0.18)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: "40%",
                height: "100%",
                borderRadius: "999px",
                background: "#1877F2",
                animation: "fq-boot-slide 1.1s ease-in-out infinite alternate",
              }}
            />
          </div>
          <style>{`@keyframes fq-boot-slide{from{transform:translateX(-100%)}to{transform:translateX(280%)}}`}</style>
        </div>
        ) : null}
        <QueryClientProvider client={queryClient}>
          <LanguageProvider initialLang={lang}>
            <Outlet />
          </LanguageProvider>
        </QueryClientProvider>
        <Toaster />
        <Scripts />
      </body>
    </html>
  );
}
