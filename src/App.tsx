import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import Playfield from "./components/Playfield";
import BetBoard from "./components/BetBoard";
import LedDisplay from "./components/LedDisplay";
import PoolBall from "./components/PoolBall";
import Celebration from "./components/Celebration";
import HelpModal from "./components/HelpModal";
import AuthScreen from "./components/AuthScreen";
import { totalBet, FREE_SPIN_RANGE, NINE_BALL_BONUS_MULT } from "./game/engine";
import { BALL_NUMBERS, type BallNumber, type Bets, type Odds } from "./game/types";
import {
  supabase,
  fetchState,
  requestSpin,
  requestRefill,
  type SpinResponse,
} from "./lib/supabase";
import { chipBeep, cueBallHit, loseSound, setMuted, spinStartBeep, winSound } from "./game/sound";

const TOKEN_VALUES = [1, 5, 10, 25];
/** Pause between auto-fired free spins, so each result is readable (ms). */
const AUTO_SPIN_DELAY = 1200;

interface CelebrationState {
  type: "win" | "jackpot" | "ninebonus";
  amount?: number;
  freeSpins?: number;
}

/** Convert the server's string-keyed maps into our number-keyed game types. */
function toOdds(rec: Record<string, number>): Odds {
  const o = {} as Odds;
  for (const n of BALL_NUMBERS) o[n] = rec[String(n)] ?? 0;
  return o;
}
function toBets(rec: Record<string, number>): Bets {
  const b: Bets = {};
  for (const [k, v] of Object.entries(rec)) {
    if (v > 0) b[Number(k) as BallNumber] = v;
  }
  return b;
}

/** Animate a number rolling from its previous value to the target. */
function useCountUp(target: number, duration = 650): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = target;
    };
  }, [target, duration]);

  return display;
}

export default function App() {
  // Auth + load state
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [stateLoaded, setStateLoaded] = useState(false);

  // Server-authoritative game state
  const [credits, setCredits] = useState(0);
  const [freeSpins, setFreeSpins] = useState(0);
  const [odds, setOdds] = useState<Odds | null>(null);

  // Local UI state
  const [bets, setBets] = useState<Bets>({});
  const [token, setToken] = useState(TOKEN_VALUES[0]);
  const [landed, setLanded] = useState<BallNumber | null>(null);
  const [spinId, setSpinId] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [lastWin, setLastWin] = useState(0);
  const [pending, setPending] = useState<SpinResponse | null>(null);
  const [muted, setMutedState] = useState(false);
  const [celebration, setCelebration] = useState<CelebrationState | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [message, setMessage] = useState("Drop tokens on the balls and press START");

  const creditOut = useCountUp(lastWin);

  const staked = totalBet(bets);
  const isFreeSpin = freeSpins > 0;
  const canSpin = !spinning && stateLoaded && (isFreeSpin || (staked > 0 && staked <= credits));

  // --- Auth wiring ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadState = useCallback(async () => {
    const s = await fetchState();
    setCredits(s.credits);
    setFreeSpins(s.freeSpins);
    setOdds(toOdds(s.odds));
    setBets(toBets(s.bets));
    setStateLoaded(true);
  }, []);

  // Load authoritative state once signed in.
  useEffect(() => {
    if (!session) {
      setStateLoaded(false);
      return;
    }
    let active = true;
    setStateLoaded(false);
    loadState()
      .then(() => {
        if (active) setMessage("Drop tokens on the balls and press START");
      })
      .catch(() => {
        if (active) setMessage("Couldn't reach the game server.");
      });
    return () => {
      active = false;
    };
  }, [session, loadState]);

  const toggleMute = useCallback(() => {
    setMutedState((m) => {
      const next = !m;
      setMuted(next);
      return next;
    });
  }, []);

  const placeToken = useCallback(
    (n: BallNumber) => {
      if (spinning || isFreeSpin) return;
      if (staked + token > credits) {
        setMessage("Not enough credits for that token.");
        return;
      }
      chipBeep();
      setBets((b) => ({ ...b, [n]: (b[n] ?? 0) + token }));
    },
    [spinning, isFreeSpin, staked, token, credits],
  );

  const removeToken = useCallback(
    (n: BallNumber) => {
      if (spinning || isFreeSpin) return;
      setBets((b) => {
        const current = b[n] ?? 0;
        if (current <= 0) return b;
        chipBeep();
        const next = { ...b };
        const remaining = current - token;
        if (remaining > 0) next[n] = remaining;
        else delete next[n];
        return next;
      });
    },
    [spinning, isFreeSpin, token],
  );

  const clearBets = useCallback(() => {
    if (spinning || isFreeSpin) return;
    setBets({});
  }, [spinning, isFreeSpin]);

  const handleSpin = useCallback(async () => {
    if (spinning || !stateLoaded) return;
    const free = freeSpins > 0;
    if (!free && (staked <= 0 || staked > credits)) return;

    setSpinning(true);
    spinStartBeep();
    setMessage(free ? `🎁 Free spin! (${freeSpins} left)` : "Selecting…");
    if (!free) setCredits((c) => c - staked); // optimistic; reconciled on settle

    const payload: Record<string, number> = {};
    for (const [k, v] of Object.entries(bets)) if (v) payload[k] = v;

    try {
      const res = await requestSpin(free ? {} : payload);
      setPending(res);
      setLanded(res.landed as BallNumber);
      setSpinId((id) => id + 1);
    } catch {
      setSpinning(false);
      setMessage("Connection error — try again.");
      void loadState(); // re-sync authoritative state (undo optimistic deduct)
    }
  }, [spinning, stateLoaded, freeSpins, staked, credits, bets, loadState]);

  const handleSettled = useCallback(() => {
    setSpinning(false);
    const res = pending;
    if (!res) return;

    // Apply authoritative state returned by the server.
    setCredits(res.credits);
    setFreeSpins(res.freeSpins);
    setOdds(toOdds(res.nextOdds));
    setBets(toBets(res.nextBets));
    setLastWin(res.won + res.instantCredit);

    if (res.bonusHit) {
      cueBallHit();
      setCelebration({ type: "jackpot", freeSpins: res.freeSpinsAwarded });
      setMessage(`🟡 THE 9 BALL! ${res.freeSpinsAwarded} free spins awarded!`);
    } else if (res.instantCredit > 0) {
      cueBallHit();
      setCelebration({ type: "ninebonus", amount: res.instantCredit });
      setMessage(`🟡 9 BALL BONUS! +${res.instantCredit} credits!`);
    } else if (res.won > 0) {
      winSound();
      setCelebration({ type: "win", amount: res.won });
      setMessage(`Ball ${res.landed} ×${res.odds} — you won ${res.won}! 🎉`);
    } else {
      loseSound();
      setMessage(`Ball ${res.landed} ×${res.odds} — no token there.`);
    }
    setPending(null);
  }, [pending]);

  const refill = useCallback(async () => {
    try {
      const s = await requestRefill();
      setCredits(s.credits);
      setFreeSpins(s.freeSpins);
      setOdds(toOdds(s.odds));
      setBets(toBets(s.bets));
      setLastWin(0);
      setMessage("Bankroll refilled. Drop tokens and press START!");
    } catch {
      setMessage("Couldn't refill — try again.");
    }
  }, []);

  const signOut = useCallback(() => {
    void supabase.auth.signOut();
  }, []);

  // Auto-fire free spins while any remain.
  useEffect(() => {
    if (freeSpins <= 0 || spinning) return;
    const t = setTimeout(() => void handleSpin(), AUTO_SPIN_DELAY);
    return () => clearTimeout(t);
  }, [freeSpins, spinning, handleSpin]);

  // Auto-dismiss the celebration overlay after it has played.
  useEffect(() => {
    if (!celebration) return;
    const t = setTimeout(() => setCelebration(null), celebration.type === "win" ? 1300 : 1900);
    return () => clearTimeout(t);
  }, [celebration]);

  // --- Render gates ---
  if (authLoading) return <Splash text="Loading…" />;
  if (!session) return <AuthScreen />;
  if (!stateLoaded || !odds) return <Splash text="Loading your table…" />;

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-4 px-3 py-6">
      {celebration && (
        <Celebration
          key={spinId}
          type={celebration.type}
          amount={celebration.amount}
          freeSpins={celebration.freeSpins}
        />
      )}

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      {/* Cabinet */}
      <div className="cabinet-stripes relative overflow-hidden rounded-3xl border-4 border-amber-700/60 p-4 shadow-2xl sm:p-6">
        {/* Marquee */}
        <header className="mb-4 flex items-center justify-between gap-2">
          <div className="w-28 shrink-0" aria-hidden />
          <div className="flex min-w-0 items-center justify-center gap-2 sm:gap-3">
            <PoolBall num={9} size={40} />
            <h1 className="truncate text-3xl font-black uppercase italic tracking-tight text-slate-900 drop-shadow-[0_2px_0_rgba(255,255,255,0.5)] sm:text-5xl">
              The <span className="text-red-600">9</span> Ball
            </h1>
          </div>
          <div className="flex w-28 shrink-0 justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              aria-label="How to play"
              title="How to play"
              className="rounded-full border border-black/20 bg-black/10 px-3 py-1 text-lg font-black transition hover:bg-black/20"
            >
              ?
            </button>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "Unmute sound" : "Mute sound"}
              title={muted ? "Unmute sound" : "Mute sound"}
              className="rounded-full border border-black/20 bg-black/10 px-2 py-1 text-lg transition hover:bg-black/20"
            >
              {muted ? "🔇" : "🔊"}
            </button>
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
              className="rounded-full border border-black/20 bg-black/10 px-2 py-1 text-lg transition hover:bg-black/20"
            >
              ⏻
            </button>
          </div>
        </header>

        <Playfield landed={landed} odds={odds} spinId={spinId} onSettled={handleSettled} />

        {/* Control deck — LED readouts */}
        <div className="mt-4 grid grid-cols-2 items-center justify-items-center gap-3 rounded-2xl border-4 border-black/40 bg-gradient-to-b from-zinc-700 to-zinc-900 px-3 py-3 shadow-inner sm:flex sm:justify-around sm:gap-0">
          <LedDisplay label="Credits" value={credits} color="#34d399" size={24} digits={4} />
          <LedDisplay label="Bet" value={staked} color="#ffd11a" size={24} digits={4} />
          <LedDisplay label="Free" value={freeSpins} color="#ff7ad1" size={24} digits={2} />
          <LedDisplay label="Credit Out" value={creditOut} color="#ff2d2d" size={24} digits={4} />
        </div>

        {/* Status line */}
        <div className="mt-3 min-h-[2.75rem] rounded-xl border border-black/20 bg-black/30 px-4 py-2 text-center text-sm font-bold text-amber-50">
          {message}
        </div>
      </div>

      {/* Bet panel */}
      <div className="rounded-3xl border-4 border-amber-700/60 bg-gradient-to-b from-amber-500 to-amber-600 p-4 shadow-xl">
        <BetBoard
          bets={bets}
          odds={odds}
          landed={spinning ? null : landed}
          disabled={spinning || isFreeSpin}
          onPlace={placeToken}
          onRemove={removeToken}
        />

        {/* Token selector — hidden during a free-spin run (bets are locked) */}
        {!isFreeSpin && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <span className="text-sm font-bold text-amber-950">Token:</span>
            {TOKEN_VALUES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setToken(v)}
                disabled={spinning}
                className={[
                  "h-10 w-10 rounded-full border-2 text-sm font-black transition disabled:opacity-50",
                  token === v
                    ? "border-slate-900 bg-slate-900 text-amber-300"
                    : "border-slate-900/40 bg-amber-200 text-slate-800 hover:bg-amber-100",
                ].join(" ")}
              >
                {v}
              </button>
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="mt-4 flex items-center justify-center gap-3">
          {!isFreeSpin && (
            <button
              type="button"
              onClick={clearBets}
              disabled={spinning || staked === 0}
              className="rounded-full border-2 border-slate-900/40 bg-amber-200 px-5 py-3 text-sm font-black uppercase text-slate-800 transition hover:bg-amber-100 disabled:opacity-40"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleSpin()}
            disabled={!canSpin || isFreeSpin}
            className="rounded-full border-4 border-green-900 bg-gradient-to-b from-green-400 to-green-600 px-12 py-3 text-lg font-black uppercase tracking-wide text-white shadow-[0_4px_0_rgba(0,0,0,0.4)] transition hover:brightness-110 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isFreeSpin ? `🎁 Free Spins ×${freeSpins}` : "Start"}
          </button>
        </div>

        {credits === 0 && staked === 0 && freeSpins === 0 && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => void refill()}
              className="rounded-full border-2 border-slate-900 px-6 py-2 text-sm font-black uppercase text-slate-900 transition hover:bg-slate-900 hover:text-amber-300"
            >
              Out of credits — refill bankroll
            </button>
          </div>
        )}

        <p className="mt-4 text-center text-xs font-semibold text-amber-950/70">
          Left-click a ball to drop a token, right-click to remove. The selector lands on one ball;
          if you've bet it, you win your stake × its odds (multipliers re-roll every spin). Land on
          the <b>9 ball</b> for {FREE_SPIN_RANGE.min}–{FREE_SPIN_RANGE.max} free spins — bets and
          multipliers lock through the run, and re-hitting the 9 pays an instant {NINE_BALL_BONUS_MULT}×
          bonus.
        </p>
      </div>
    </div>
  );
}

function Splash({ text }: { text: string }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4">
      <PoolBall num={9} size={64} />
      <p className="text-lg font-bold text-white/70">{text}</p>
    </div>
  );
}
