import { BET_NUMBERS, MULTIPLIER_RANGE, type BallNumber, type Bets, type Odds } from "../game/types";
import PoolBall from "./PoolBall";
import LedDisplay from "./LedDisplay";

interface BetBoardProps {
  bets: Bets;
  odds: Odds;
  landed: BallNumber | null;
  disabled: boolean;
  onPlace: (n: BallNumber) => void;
  onRemove: (n: BallNumber) => void;
}

/**
 * The front-panel bet row: a ball button per number with its odds on an LED and
 * the tokens you've staked on it. Left-click stakes, right-click removes.
 */
export default function BetBoard({ bets, odds, landed, disabled, onPlace, onRemove }: BetBoardProps) {
  return (
    <div className="grid grid-cols-4 gap-3 sm:grid-cols-8 lg:grid-cols-4 lg:gap-4">
      {BET_NUMBERS.map((n) => {
        const chips = bets[n] ?? 0;
        const isWinner = landed === n;
        const isHighMult = odds[n] > MULTIPLIER_RANGE.max;
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onPlace(n)}
            onContextMenu={(e) => {
              e.preventDefault();
              onRemove(n);
            }}
            title="Left-click to add a token · Right-click to remove"
            className="group relative flex flex-col items-center gap-1 rounded-xl border-2 border-black/30 bg-black/20 p-2 transition disabled:cursor-not-allowed disabled:opacity-50 lg:gap-2 lg:p-3"
            style={{
              boxShadow: isWinner
                ? "0 0 0 3px #facc15, 0 0 16px rgba(250,204,21,0.7)"
                : chips > 0
                  ? "0 0 0 2px #34d399"
                  : undefined,
            }}
          >
            <PoolBall num={n} size={56} />
            <LedDisplay value={`x${odds[n]}`} size={15} color={isHighMult ? "#ffd11a" : "#ff2d2d"} />
            {chips > 0 && (
              <span className="absolute -right-1 -top-1 min-w-6 rounded-full bg-emerald-500 px-1.5 py-0.5 text-center text-xs font-black text-white shadow">
                {chips}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
