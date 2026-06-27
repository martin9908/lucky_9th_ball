import {
  BALL_NUMBERS,
  BALLS,
  MULTIPLIER_RANGE,
  HIGH_MULTIPLIER_RANGE,
  HIGH_MULTIPLIER_CHANCE,
  type BallNumber,
  type Bets,
  type Odds,
  type SpinResult,
} from "./types";

const TOTAL_WEIGHT = BALL_NUMBERS.reduce((sum, n) => sum + BALLS[n].weight, 0);

/** Landing on the 9 ball awards a random number of free spins in this range. */
export const FREE_SPIN_RANGE = { min: 3, max: 10 } as const;

/** Re-hitting the 9 during a free-spin run pays this multiple of the total bet. */
export const NINE_BALL_BONUS_MULT = 5;

function randomInt(minInclusive: number, maxInclusive: number): number {
  return Math.floor(Math.random() * (maxInclusive - minInclusive + 1)) + minInclusive;
}

/**
 * Roll a fresh multiplier for each ball (the 9 stays 0). Each ball has a small
 * chance to roll from the richer HIGH_MULTIPLIER_RANGE instead of the normal one.
 */
export function generateOdds(): Odds {
  const odds = {} as Odds;
  for (const n of BALL_NUMBERS) {
    if (n === 9) {
      odds[n] = 0;
      continue;
    }
    const range = Math.random() < HIGH_MULTIPLIER_CHANCE ? HIGH_MULTIPLIER_RANGE : MULTIPLIER_RANGE;
    odds[n] = randomInt(range.min, range.max);
  }
  return odds;
}

/** Pick the landed ball, weighted so higher-tier balls land less often. */
function pickLandedNumber(): BallNumber {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const n of BALL_NUMBERS) {
    roll -= BALLS[n].weight;
    if (roll <= 0) return n;
  }
  return BALL_NUMBERS[0];
}

export function totalBet(bets: Bets): number {
  return Object.values(bets).reduce((sum, chips) => sum + (chips ?? 0), 0);
}

export interface SpinOptions {
  /** A free spin reuses the current bets and isn't re-charged to the balance. */
  isFreeSpin?: boolean;
}

/**
 * Resolve a single round against the supplied per-ball odds. Pure: takes the
 * current bets and returns the outcome. Balance bookkeeping (charging the bet,
 * crediting the win) is the caller's job.
 *
 * On a paid spin, landing the 9 pays nothing but awards 3–10 free spins. During
 * a free-spin run, re-hitting the 9 instead pays an instant credit (a multiple
 * of the total bet) and the run continues.
 */
export function spin(bets: Bets, odds: Odds, options: SpinOptions = {}): SpinResult {
  const isFreeSpin = options.isFreeSpin ?? false;
  const landed = pickLandedNumber();
  const isNine = landed === 9;
  const stake = totalBet(bets);

  const bonusHit = isNine && !isFreeSpin;
  const freeSpinsAwarded = bonusHit ? randomInt(FREE_SPIN_RANGE.min, FREE_SPIN_RANGE.max) : 0;
  const instantCredit = isNine && isFreeSpin ? stake * NINE_BALL_BONUS_MULT : 0;

  const landedOdds = odds[landed];
  const won = isNine ? 0 : (bets[landed] ?? 0) * landedOdds;

  return {
    landed,
    odds: landedOdds,
    totalBet: stake,
    won,
    bonusHit,
    freeSpinsAwarded,
    instantCredit,
    wasFreeSpin: isFreeSpin,
  };
}
