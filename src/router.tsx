import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Start loading a route's data on hover / touch-press, before the tap
    // commits — so tab switches don't wait on a cold network round-trip.
    defaultPreload: "intent",
    // Keep at 0 so the router always defers caching to React Query, whose
    // per-query staleTime governs when data is actually refetched.
    defaultPreloadStaleTime: 0,
  });

  return router;
};
