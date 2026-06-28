import { useEffect } from "react";
import { FREE_SPIN_RANGE, RETRIGGER_FREE_SPINS } from "../game/engine";
import { MULTIPLIER_RANGE, JACKPOT_MULTIPLIER } from "../game/types";
import PoolBall from "./PoolBall";

interface HelpModalProps {
  onClose: () => void;
}

interface Rule {
  icon: string;
  title: string;
  body: React.ReactNode;
}

const RULES: Rule[] = [
  {
    icon: "🎯",
    title: "Place your bets",
    body: "Left-click a ball (1–8) to drop a token, right-click to take one back. Pick your token value below the board.",
  },
  {
    icon: "🎰",
    title: "Spin",
    body: "The selector lands on one ball. If you bet on it, you win your stake × that ball's multiplier — so every ball is worth the same on average.",
  },
  {
    icon: "🔢",
    title: "Multipliers",
    body: `Each spin the eight multipliers (×${MULTIPLIER_RANGE.min} up to a jackpot ×${JACKPOT_MULTIPLIER}) are dealt to the balls at random. The bigger a ball's multiplier, the less often it lands — chasing the gold ×${JACKPOT_MULTIPLIER} is a long shot.`,
  },
  {
    icon: "🟡",
    title: "The 9 ball",
    body: `Land the 9 to win ${FREE_SPIN_RANGE.min}–${FREE_SPIN_RANGE.max} free spins. Your bets and multipliers lock for the run, and the spins fire automatically.`,
  },
  {
    icon: "💰",
    title: "Retrigger",
    body: `Re-hit the 9 during a free-spin run to add ${RETRIGGER_FREE_SPINS} more free spins to the count.`,
  },
  {
    icon: "🪙",
    title: "Credits",
    body: "Your bankroll saves automatically and survives a refresh. Run dry and you can refill it.",
  },
];

/** A dismissible rules/paytable overlay. Close via the button, backdrop, or Esc. */
export default function HelpModal({ onClose }: HelpModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl border-4 border-amber-500/70 bg-slate-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="How to play"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-lg font-bold text-white/70 transition hover:bg-white/10"
        >
          ✕
        </button>

        <div className="mb-5 flex items-center gap-3">
          <PoolBall num={9} size={40} />
          <h2 className="text-2xl font-black uppercase italic tracking-tight text-amber-300">
            How to Play
          </h2>
        </div>

        <ul className="flex flex-col gap-4">
          {RULES.map((rule) => (
            <li key={rule.title} className="flex gap-3">
              <span className="text-xl leading-none">{rule.icon}</span>
              <div>
                <div className="text-sm font-black uppercase tracking-wide text-amber-200">
                  {rule.title}
                </div>
                <p className="mt-0.5 text-sm text-white/70">{rule.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
