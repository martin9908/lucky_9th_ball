import { useEffect, useRef, useState } from "react";
import { BALL_NUMBERS, MULTIPLIER_RANGE, type BallNumber, type Odds } from "../game/types";
import PoolBall from "./PoolBall";
import LedDisplay from "./LedDisplay";
import { chaseTick } from "../game/sound";

interface PlayfieldProps {
  /** Ball the round resolved to, or null before any round. */
  landed: BallNumber | null;
  /** Current per-ball multipliers shown on each ball's LED. */
  odds: Odds;
  /** Increments on every new round to (re)trigger the chase. */
  spinId: number;
  /** Called when the chase finishes settling on the landed ball. */
  onSettled: () => void;
}

const MIN_INTERVAL = 55;
const MAX_INTERVAL = 300;
const LOOPS = 3;

/**
 * The lit "chase" runs across the grid of balls, fast at first then easing to a
 * stop on the winning ball — the cabinet's light-chase selector.
 */
export default function Playfield({ landed, odds, spinId, onSettled }: PlayfieldProps) {
  const [active, setActive] = useState<number | null>(null);
  const [settled, setSettled] = useState(true);
  const lastSpinId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (spinId === lastSpinId.current || landed === null) return;
    lastSpinId.current = spinId;

    const target = BALL_NUMBERS.indexOf(landed);
    const steps = LOOPS * BALL_NUMBERS.length + target;
    setSettled(false);
    let i = 0;

    const step = () => {
      setActive(i % BALL_NUMBERS.length);
      chaseTick();
      if (i >= steps) {
        setActive(target);
        setSettled(true);
        onSettled();
        return;
      }
      const progress = i / steps;
      const interval = MIN_INTERVAL + (MAX_INTERVAL - MIN_INTERVAL) * Math.pow(progress, 2.4);
      i++;
      timer.current = setTimeout(step, interval);
    };

    step();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinId, landed]);

  return (
    <div className="rounded-2xl border-4 border-black/40 bg-gradient-to-b from-slate-800 to-slate-950 p-4 shadow-[inset_0_4px_16px_rgba(0,0,0,0.7)]">
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {BALL_NUMBERS.map((n, i) => {
          const isActive = active === i;
          const isWinner = settled && landed === n;
          const lit = isActive || isWinner;
          // Only dim the also-rans once a chase is running or has settled.
          const hasFocus = active !== null || (settled && landed !== null);
          return (
            <div
              key={n}
              className="flex flex-col items-center gap-2 rounded-xl p-2 transition-all"
              style={{
                background: lit ? "rgba(250,204,21,0.18)" : "transparent",
                boxShadow: isActive ? "0 0 0 3px #facc15, 0 0 18px rgba(250,204,21,0.6)" : undefined,
                animation: isWinner ? "winner-pulse 0.7s ease-in-out infinite" : undefined,
              }}
            >
              <PoolBall num={n} size={56} dim={!lit && hasFocus} />
              <LedDisplay
                value={n === 9 ? "FREE" : `x${odds[n]}`}
                size={16}
                color={n === 9 || odds[n] > MULTIPLIER_RANGE.max ? "#ffd11a" : "#ff2d2d"}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
