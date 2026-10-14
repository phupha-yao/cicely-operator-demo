import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { checkIsAdmin } from "@/lib/admin.functions";
import { getShell } from "@/lib/operator.functions";
import { parseDashboardSearch } from "@/lib/filters";
import { supabase } from "@/integrations/supabase/client";
import { AppBar, type NavItem } from "@/components/operator/AppBar";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  validateSearch: parseDashboardSearch,
  head: () => ({
    meta: [{ title: "Cicely — Operator dashboard" }],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = Route.useRouteContext();
  const isAdmin = useServerFn(checkIsAdmin);
  const shellFn = useServerFn(getShell);
  const q = useQuery({ queryKey: ["is-admin"], queryFn: () => isAdmin(), retry: 1 });
  const shell = useQuery({
    queryKey: ["shell"],
    queryFn: () => shellFn(),
    enabled: !!q.data?.isAdmin,
    staleTime: 60_000,
  });
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  if (q.isLoading) {
    return <div className="admin-ui min-h-dvh p-6 text-ink/70">Checking access…</div>;
  }
  if (q.isError || !q.data?.isAdmin) {
    return (
      <div className="admin-ui min-h-dvh p-6">
        <h1 className="font-display text-2xl">No access</h1>
        <p className="mt-2 text-sm text-ink/70">
          This account isn't set up for the dashboard. Ask Cicely to add you.
        </p>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="mt-6 rounded-lg bg-ink px-4 py-2 text-canvas disabled:opacity-60"
        >
          Sign out
        </button>
      </div>
    );
  }

  const nav: NavItem[] = [
    { to: "/admin", label: "Overview", exact: true },
    { to: "/admin/locations", label: "Locations", exact: false },
    { to: "/admin/context", label: "Context", exact: false },
    { to: "/admin/issues", label: "Issues", exact: false, badge: shell.data?.unowned },
    { to: "/admin/method", label: "Method", exact: false },
  ];

  return (
    <div className="admin-ui min-h-dvh">
      <AppBar
        orgName={shell.data?.org.name ?? null}
        sectorLabel={shell.data?.sectorLabel ?? null}
        dataTo={shell.data?.dataTo ?? null}
        email={user.email ?? null}
        nav={nav}
        onSignOut={signOut}
        signingOut={signingOut}
      />
      <div className="mx-auto max-w-[88rem] px-6 py-7">
        <Outlet />
      </div>
    </div>
  );
}
