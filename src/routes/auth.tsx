import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Sign in — Cicely" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState(import.meta.env.DEV ? "demo@cicely.local" : "");
  const [password, setPassword] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/admin", replace: true });
    });
  }, [navigate]);

  async function onSignIn() {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setErr(error.message);
      toast.error("Sign in failed", { description: error.message });
      return;
    }
    navigate({ to: "/admin", replace: true });
  }

  return (
    <div className="admin-ui min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
        <img src="/brand/cicely-wordmark.svg" alt="Cicely" className="h-6 w-auto self-start" />
        <h1 className="mt-6 font-display text-[1.75rem] leading-tight">Operator dashboard</h1>
        <div className="brand-strip mt-3 w-40" aria-hidden="true" />
        <p className="mt-3 text-sm text-ink/70">
          Where and when people find your spaces hard to use, and what happened when you acted.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSignIn();
          }}
          className="mt-8 space-y-3"
        >
          <label className="block text-sm text-ink">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              className="mt-1 h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm"
            />
          </label>
          <label className="block text-sm text-ink">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="mt-1 h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm"
            />
          </label>
          {err && (
            <p role="alert" className="text-sm text-[var(--data-alert-ink)]">
              {err}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !email || !password}
            className="h-10 w-full rounded-lg bg-ink px-4 font-semibold text-canvas disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
