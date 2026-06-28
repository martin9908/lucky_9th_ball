import {
  BALL_NUMBERS,
  BET_NUMBERS,
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

/** Free spins awarded by the first 9-ball hit (on a paid spin). */
export const FREE_SPIN_RANGE = { min: 10, max: 15 } as const;

/** Free spins added when the 9 is re-hit during a free-spin run (retrigger). */
export const RETRIGGER_FREE_SPINS = 3;

function randomInt(minInclusive: number, maxInclusive: number): number {
  return Math.floor(Math.random() * (maxInclusive - minInclusive + 1)) + minInclusive;
}

/** Pick `count` distinct integers from [min, max] (partial Fisher–Yates). */
function sampleDistinct(min: number, max: number, count: number): number[] {
  const pool: number[] = [];
  for (let v = min; v <= max; v++) pool.push(v);
  for (let i = 0; i < count && i < pool.length; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, count);
}

/**
 * Roll a fresh multiplier for each bet ball (the 9 stays 0). Each ball may roll
 * from the richer high band, and all eight multipliers are distinct — sampled
 * without replacement within each band (the bands don't overlap).
 */
export function generateOdds(): Odds {
  const odds = {} as Odds;
  const high = BET_NUMBERS.map(() => Math.random() < HIGH_MULTIPLIER_CHANCE);
  const highCount = high.filter(Boolean).length;
  const normalVals = sampleDistinct(MULTIPLIER_RANGE.min, MULTIPLIER_RANGE.max, high.length - highCount);
  const highVals = sampleDistinct(HIGH_MULTIPLIER_RANGE.min, HIGH_MULTIPLIER_RANGE.max, highCount);
  let ni = 0;
  let hi = 0;
  BET_NUMBERS.forEach((n, i) => {
    odds[n] = high[i] ? highVals[hi++] : normalVals[ni++];
  });
  odds[9] = 0;
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
 * On a paid spin, landing the 9 pays nothing but awards 10–15 free spins. During
 * a free-spin run, re-hitting the 9 retriggers +3 more free spins and the run
 * continues.
 */
export function spin(bets: Bets, odds: Odds, options: SpinOptions = {}): SpinResult {
  const isFreeSpin = options.isFreeSpin ?? false;
  const landed = pickLandedNumber();
  const isNine = landed === 9;
  const stake = totalBet(bets);

  const bonusHit = isNine && !isFreeSpin;
  const retrigger = isNine && isFreeSpin;
  const freeSpinsAwarded = bonusHit
    ? randomInt(FREE_SPIN_RANGE.min, FREE_SPIN_RANGE.max)
    : retrigger
      ? RETRIGGER_FREE_SPINS
      : 0;

  const landedOdds = odds[landed];
  const won = isNine ? 0 : (bets[landed] ?? 0) * landedOdds;

  return {
    landed,
    odds: landedOdds,
    totalBet: stake,
    won,
    bonusHit,
    retrigger,
    freeSpinsAwarded,
    wasFreeSpin: isFreeSpin,
  };
}
