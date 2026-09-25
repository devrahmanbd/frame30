import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Lock,
  ShieldAlert,
  Loader2,
  ArrowRight,
  KeyRound,
} from "@/components/icons/tabler";
import { supabase } from "@/integrations/supabase/client";
import { platformIsAdminFn } from "@/lib/platform.functions";

export const Route = createFileRoute("/root/login")({
  head: () => ({
    meta: [
      { title: "Platform Owner Sign In — Framique Root" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RootLoginPage,
});

export function RootLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email || !password) return;

    setBusy(true);
    setErrorMsg(null);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        throw error;
      }

      const user = data.user;
      if (!user) {
        throw new Error("Failed to authenticate session.");
      }

      // Check if user is registered in platform_admins table
      let isVerifiedOwner = false;
      const { data: adminRow } = await supabase
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (adminRow) {
        isVerifiedOwner = true;
      } else {
        const serverCheck = await platformIsAdminFn().catch(() => ({
          admin: false,
        }));
        if (serverCheck?.admin) {
          isVerifiedOwner = true;
        }
      }

      // Enforce strict persona boundary: non-owners are ejected
      if (!isVerifiedOwner) {
        await supabase.auth.signOut();
        setErrorMsg("Invalid credentials.");
        return;
      }

      // Navigate straight to root console
      void navigate({ to: "/root", replace: true });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Authentication failed.";
      setErrorMsg(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#090a0f] text-slate-100 p-4 select-none">
      <div className="w-full max-w-md bg-[#11131a] border border-slate-800/80 rounded-xl shadow-2xl p-8 backdrop-blur-xl relative overflow-hidden">
        {/* Subtle top indicator bar */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-rose-500 via-purple-500 to-indigo-500" />

        <div className="flex items-center gap-3 mb-6">
          <div className="size-10 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <KeyRound className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white flex items-center gap-2">
              Framique Root
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                Owner Only
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Infrastructure and platform governance console
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-6 p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-start gap-2.5">
            <ShieldAlert className="size-4 shrink-0 mt-0.5 text-rose-400" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase tracking-wider">
              Owner Email
            </label>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@framique.com"
              className="w-full h-11 px-3.5 rounded-lg bg-slate-900/90 border border-slate-800 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase tracking-wider">
              Security Key / Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full h-11 px-3.5 rounded-lg bg-slate-900/90 border border-slate-800 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={busy || !email || !password}
              className="w-full h-11 rounded-lg bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-xs font-semibold uppercase tracking-widest transition-all duration-150 flex items-center justify-center gap-2 shadow-lg shadow-rose-950/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Verifying clearance...</span>
                </>
              ) : (
                <>
                  <span>Authenticate Root</span>
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </div>
        </form>

        <div className="mt-8 pt-4 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <Lock className="size-3" />
            256-bit Encrypted Session
          </span>
          <span>Framique Edge Guard</span>
        </div>
      </div>
    </div>
  );
}
