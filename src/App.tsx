import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import Playfield from "./components/Playfield";
import BetBoard from "./components/BetBoard";
import LedDisplay from "./components/LedDisplay";
import PoolBall from "./components/PoolBall";
import Celebration from "./components/Celebration";
import HelpModal from "./components/HelpModal";
import AuthScreen from "./components/AuthScreen";
import { totalBet, FREE_SPIN_RANGE, RETRIGGER_FREE_SPINS } from "./game/engine";
import { BALL_NUMBERS, type BallNumber, type Bets, type Odds } from "./game/types";
import {
  supabase,
  fetchState,
  requestSpin,
  requestAddCredits,
  type SpinResponse,
} from "./lib/supabase";
import { chipBeep, cueBallHit, loseSound, setMuted, spinStartBeep, winSound } from "./game/sound";

// Token denominations — the smallest is the minimum bet.
const TOKEN_VALUES = [10, 25, 50, 100];
/** Pause between auto-fired free spins, so each result is readable (ms). */
const AUTO_SPIN_DELAY = 600;
/** How long the winning board is held while the payout counts into Credits (ms). */
const CASH_OUT_DURATION = 1700;
/** Duration of the Credit Out → Credits transfer roll (ms). */
const TRANSFER_DURATION = 1100;
/** Normal Credits readout count-up duration (ms). */
const READOUT_DURATION = 650;

interface CelebrationState {
  type: "win" | "jackpot" | "retrigger";
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

/** Tween a number from→to over a duration, calling onUpdate each frame. Returns a cancel fn. */
function tween(from: number, to: number, duration: number, onUpdate: (v: number) => void): () => void {
  if (from === to) {
    onUpdate(to);
    return () => {};
  }
  const start = performance.now();
  let raf = requestAnimationFrame(function step(now: number) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    onUpdate(Math.round(from + (to - from) * eased));
    if (p < 1) raf = requestAnimationFrame(step);
  });
  return () => cancelAnimationFrame(raf);
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
  const [pending, setPending] = useState<SpinResponse | null>(null);
  const [muted, setMutedState] = useState(false);
  const [celebration, setCelebration] = useState<CelebrationState | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [message, setMessage] = useState("Drop tokens on the balls and press START");
  // Pending board refresh + transfer params held during the cash-out animation.
  const [cashOut, setCashOut] = useState<{
    odds: Odds;
    bets: Bets;
    win: number;
    base: number;
  } | null>(null);

  // Animated LED readouts. Credits tracks the balance; Credit Out shows the
  // current payout, which drains into Credits during a cash-out.
  const [creditsDisplay, setCreditsDisplay] = useState(0);
  const [creditOutDisplay, setCreditOutDisplay] = useState(0);
  const creditsDispRef = useRef(0);
  creditsDispRef.current = creditsDisplay;
  // The scrollable layout container; scrolled to the top when a spin starts.
  const scrollRef = useRef<HTMLDivElement>(null);

  const staked = totalBet(bets);
  const isFreeSpin = freeSpins > 0;
  const cashingOut = cashOut !== null;
  const canSpin =
    !spinning && stateLoaded && !cashingOut && (isFreeSpin || (staked > 0 && staked <= credits));

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
    // Sync the readouts directly (the credits-tracking effect is gated during a
    // run). Mid-run, Credits shows the frozen pre-run base and Credit Out shows
    // the server-tracked tally, so a refresh restores both. Outside a run
    // runWinnings is 0, so this is just credits / 0.
    setCreditsDisplay(s.credits - s.runWinnings);
    setCreditOutDisplay(s.runWinnings);
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
      if (spinning || isFreeSpin || cashingOut) return;
      if (staked + token > credits) {
        setMessage("Not enough credits for that token.");
        return;
      }
      chipBeep();
      setBets((b) => ({ ...b, [n]: (b[n] ?? 0) + token }));
    },
    [spinning, isFreeSpin, cashingOut, staked, token, credits],
  );

  const removeToken = useCallback(
    (n: BallNumber) => {
      if (spinning || isFreeSpin || cashingOut) return;
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
    [spinning, isFreeSpin, cashingOut, token],
  );

  const clearBets = useCallback(() => {
    if (spinning || isFreeSpin || cashingOut) return;
    setBets({});
  }, [spinning, isFreeSpin, cashingOut]);

  const handleSpin = useCallback(async () => {
    if (spinning || !stateLoaded) return;
    const free = freeSpins > 0;
    if (!free && (staked <= 0 || staked > credits)) return;

    setSpinning(true);
    // Clear the previous payout on a new paid round, but keep the running tally
    // through a free-spin run so Credit Out accumulates.
    if (!free) setCreditOutDisplay(0);
    // Bring the playfield into view so the chase isn't off-screen on mobile.
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, behavior: "smooth" }); // fallback if the window is the scroller
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

    // Game state applies immediately (authoritative).
    const won = res.won;
    setCredits(res.credits);
    setFreeSpins(res.freeSpins);

    if (res.bonusHit) {
      setCreditOutDisplay(0); // run starts fresh (server runWinnings is 0)
      cueBallHit();
      setCelebration({ type: "jackpot", freeSpins: res.freeSpinsAwarded });
      setMessage(`🟡 THE 9 BALL! ${res.freeSpinsAwarded} free spins awarded!`);
    } else if (res.retrigger) {
      cueBallHit();
      setCelebration({ type: "retrigger", freeSpins: res.freeSpinsAwarded });
      setMessage(`🟡 9 BALL! +${res.freeSpinsAwarded} free spins!`);
    } else if (res.won > 0) {
      winSound();
      setCelebration({ type: "win", amount: res.won });
      setMessage(`Ball ${res.landed} ×${res.odds} — you won ${res.won}! 🎉`);
    } else {
      loseSound();
      setMessage(`Ball ${res.landed} ×${res.odds} — no token there.`);
    }

    // The free-spin run total (res.runWinnings) is tracked server-side, so it
    // survives a refresh. During the run Credits is frozen and winnings tally on
    // Credit Out; when the run ends the whole tally transfers into Credits.
    const nextOdds = toOdds(res.nextOdds);
    const nextBets = toBets(res.nextBets);
    const runEnded = res.wasFreeSpin && res.freeSpins === 0;

    if (runEnded && res.runWinnings > 0) {
      // End of a free-spin run: cash out the whole accumulated tally.
      setCashOut({
        odds: nextOdds,
        bets: nextBets,
        win: res.runWinnings,
        base: res.credits - res.runWinnings,
      });
    } else if (!res.wasFreeSpin && won > 0 && res.freeSpins === 0) {
      // A normal paid win: transfer it from Credit Out into Credits.
      setCashOut({ odds: nextOdds, bets: nextBets, win: won, base: res.credits - won });
    } else if (res.freeSpins > 0) {
      // Mid free-spin run: keep the server-tracked tally on Credit Out; board locked.
      setCreditOutDisplay(res.runWinnings);
      setOdds(nextOdds);
      setBets(nextBets);
    } else {
      // A loss (or a winless run end): nothing to cash out, refresh now.
      setCreditOutDisplay(0);
      setOdds(nextOdds);
      setBets(nextBets);
    }
    setPending(null);
  }, [pending]);

  const addCredits = useCallback(async () => {
    try {
      const s = await requestAddCredits();
      setCredits(s.credits);
      setMessage(`+10 credits added.`);
    } catch {
      setMessage("Couldn't add credits — try again.");
    }
  }, []);

  const signOut = useCallback(() => {
    void supabase.auth.signOut();
  }, []);

  // Keep the latest handleSpin in a ref so the auto-fire timer below doesn't list
  // it as a dependency — handleSpin's identity churns (it closes over bets,
  // credits, staked…), and depending on it would cancel and reschedule the
  // pending free spin on every unrelated re-render, so it could never fire.
  const handleSpinRef = useRef(handleSpin);
  handleSpinRef.current = handleSpin;

  // Auto-fire free spins while any remain. Depends only on freeSpins/spinning so
  // the scheduled spin survives until it actually fires.
  useEffect(() => {
    if (freeSpins <= 0 || spinning) return;
    const t = setTimeout(() => void handleSpinRef.current(), AUTO_SPIN_DELAY);
    return () => clearTimeout(t);
  }, [freeSpins, spinning]);

  // Credits readout counts toward the authoritative balance — except during a
  // cash-out transfer or a free-spin run, where it's frozen while winnings
  // accumulate in Credit Out (then transfer in at the end of the run).
  useEffect(() => {
    if (cashingOut || freeSpins > 0) return;
    return tween(creditsDispRef.current, credits, READOUT_DURATION, setCreditsDisplay);
  }, [credits, cashingOut, freeSpins]);

  // Cash-out: the payout drains from Credit Out into Credits in lockstep, the
  // winning board is held, then it refreshes (clear bets / re-roll odds).
  useEffect(() => {
    if (!cashOut) return;
    const { win, base, odds: nextOdds, bets: nextBets } = cashOut;
    setCreditsDisplay(base);
    setCreditOutDisplay(win);
    const start = performance.now();
    let raf = requestAnimationFrame(function step(now: number) {
      const p = Math.min(1, (now - start) / TRANSFER_DURATION);
      const eased = 1 - Math.pow(1 - p, 3);
      const moved = Math.round(win * eased);
      setCreditsDisplay(base + moved);
      setCreditOutDisplay(win - moved);
      if (p < 1) raf = requestAnimationFrame(step);
    });
    const t = setTimeout(() => {
      setOdds(nextOdds);
      setBets(nextBets);
      setCashOut(null);
    }, CASH_OUT_DURATION);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [cashOut]);

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
    <div
      ref={scrollRef}
      className="mx-auto h-dvh w-full max-w-2xl overflow-y-auto px-3 py-6 lg:max-w-5xl"
    >
      {celebration && (
        <Celebration
          key={spinId}
          type={celebration.type}
          amount={celebration.amount}
          freeSpins={celebration.freeSpins}
        />
      )}

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      {/* Side-by-side on large screens: the table (left) and the bets (right). */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        {/* Cabinet */}
        <div className="cabinet-stripes relative overflow-hidden rounded-3xl border-4 border-amber-700/60 p-4 shadow-2xl sm:p-6 lg:flex-1 lg:min-w-0">
        {/* Marquee — on phones: title left, buttons right (no overlap). On
            larger screens: title centered with the buttons floated right. */}
        <header className="relative mb-4 flex min-h-11 items-center justify-between gap-2 sm:justify-center sm:gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <PoolBall num={9} size={36} />
            <h1 className="text-2xl font-black uppercase italic tracking-tight text-slate-900 drop-shadow-[0_2px_0_rgba(255,255,255,0.5)] sm:text-5xl">
              The <span className="text-red-600">9</span> Ball
            </h1>
          </div>
          <div className="flex shrink-0 gap-1 sm:absolute sm:right-0 sm:top-1/2 sm:-translate-y-1/2">
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              aria-label="How to play"
              title="How to play"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-black/20 bg-black/10 text-base font-black transition hover:bg-black/20"
            >
              ?
            </button>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "Unmute sound" : "Mute sound"}
              title={muted ? "Unmute sound" : "Mute sound"}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-black/20 bg-black/10 text-base transition hover:bg-black/20"
            >
              {muted ? "🔇" : "🔊"}
            </button>
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-black/20 bg-black/10 text-base transition hover:bg-black/20"
            >
              ⏻
            </button>
          </div>
        </header>

        <Playfield landed={landed} odds={odds} spinId={spinId} fast={isFreeSpin} onSettled={handleSettled} />

        {/* Control deck — LED readouts */}
        <div className="mt-4 grid grid-cols-2 items-center justify-items-center gap-3 rounded-2xl border-4 border-black/40 bg-gradient-to-b from-zinc-700 to-zinc-900 px-3 py-3 shadow-inner sm:flex sm:justify-around sm:gap-0">
          <LedDisplay label="Credits" value={creditsDisplay} color="#34d399" size={24} digits={4} />
          <LedDisplay label="Bet" value={staked} color="#ffd11a" size={24} digits={4} />
          <LedDisplay label="Free" value={freeSpins} color="#ff7ad1" size={24} digits={2} />
          <LedDisplay label="Credit Out" value={creditOutDisplay} color="#ff2d2d" size={24} digits={4} />
        </div>

        {/* Status line */}
        <div className="mt-3 min-h-[2.75rem] rounded-xl border border-black/20 bg-black/30 px-4 py-2 text-center text-sm font-bold text-amber-50">
          {message}
        </div>
      </div>

        {/* Bet panel */}
        <div className="flex flex-col justify-center rounded-3xl border-4 border-amber-700/60 bg-gradient-to-b from-amber-500 to-amber-600 p-4 shadow-xl lg:flex-1 lg:min-w-0 lg:p-6">
        <BetBoard
          bets={bets}
          odds={odds}
          landed={spinning ? null : landed}
          disabled={spinning || isFreeSpin || cashingOut}
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

        {/* Free top-up (no payment needed). */}
        {!isFreeSpin && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => void addCredits()}
              disabled={spinning || credits >= 100}
              className="rounded-full border-2 border-slate-900/40 bg-amber-200/70 px-5 py-2 text-sm font-black uppercase text-slate-800 transition hover:bg-amber-100 disabled:opacity-40"
            >
              💰 Add 10 Credits
            </button>
          </div>
        )}

        <p className="mt-4 text-center text-xs font-semibold text-amber-950/70">
          Left-click a ball to drop a token, right-click to remove. The selector lands on one ball;
          if you've bet it, you win your stake × its odds (multipliers re-roll every spin). Land on
          the <b>9 ball</b> for {FREE_SPIN_RANGE.min}–{FREE_SPIN_RANGE.max} free spins — bets and
          multipliers lock through the run, and re-hitting the 9 adds {RETRIGGER_FREE_SPINS} more.
        </p>
      </div>
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
