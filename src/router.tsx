import { createRouter as createTanstackRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import { getCurrentNonce } from "./lib/ssr-nonce";
import { shouldRetryQuery } from "./lib/should-retry-query";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Never retry 429s: the server told us to back off, and retrying
        // turns one tripped bucket into a self-sustaining retry storm
        // (Sept 2026 dashboard incident).
        retry: shouldRetryQuery,
      },
    },
  });
  return createTanstackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    // Hovering across the dashboard nav used to refire every route loader
    // with no cooldown, fanning out into hundreds of server-function calls.
    defaultPreloadStaleTime: 30_000,
    ssr: {
      nonce: typeof window === "undefined" ? getCurrentNonce() : undefined,
    },
  });
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
