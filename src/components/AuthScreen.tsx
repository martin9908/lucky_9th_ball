import { useState } from "react";
import { supabase } from "../lib/supabase";
import PoolBall from "./PoolBall";

type Mode = "signin" | "signup";

/** Email + password login / signup gate shown before the game. */
export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // If email confirmation is on, there's no session yet.
        if (!data.session) {
          setNotice("Account created — check your email to confirm, then sign in.");
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      // On success with a session, the auth listener in App swaps to the game.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border-4 border-amber-500/70 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <PoolBall num={9} size={56} />
          <h1 className="text-3xl font-black uppercase italic tracking-tight text-amber-300">
            The <span className="text-red-500">9</span> Ball
          </h1>
          <p className="text-sm text-white/60">
            {mode === "signin" ? "Sign in to play" : "Create an account to play"}
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white outline-none focus:border-amber-400"
          />
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white outline-none focus:border-amber-400"
          />

          {error && <p className="text-sm font-semibold text-red-400">{error}</p>}
          {notice && <p className="text-sm font-semibold text-emerald-400">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-full bg-gradient-to-b from-green-400 to-green-600 px-6 py-3 text-lg font-black uppercase tracking-wide text-white shadow-lg transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "…" : mode === "signin" ? "Sign In" : "Sign Up"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "signin" ? "signup" : "signin"));
            setError(null);
            setNotice(null);
          }}
          className="mt-4 w-full text-center text-sm text-white/60 underline-offset-2 hover:text-white hover:underline"
        >
          {mode === "signin" ? "No account? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
