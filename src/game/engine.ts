import {
  BALL_NUMBERS,
  BET_NUMBERS,
  PALETTE,
  BONUS_HIT_CHANCE,
  type BallNumber,
  type Bets,
  type Odds,
  type SpinResult,
} from "./types";

// Client mirror of the server's house-edge model (the authoritative copy lives
// in supabase/functions/game/engine.ts). This drives the UI/animation and the
// Monte-Carlo sim; real outcomes always come from the server. The per-user
// throttle is server-only — the browser just renders whatever odds it's sent.

/** Free spins awarded by the first 9-ball hit (on a paid spin). */
export const FREE_SPIN_RANGE = { min: 3, max: 5 } as const;

/** Free spins added when the 9 is re-hit during a free-spin run (retrigger). */
export const RETRIGGER_FREE_SPINS = 1;

function randomInt(minInclusive: number, maxInclusive: number): number {
  return Math.floor(Math.random() * (maxInclusive - minInclusive + 1)) + minInclusive;
}

/** Fisher–Yates shuffle (returns a new array). */
function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Assign the fixed palette to the eight bet balls at random (the 9 is always 0).
 * Because the set of multipliers is fixed, the base RTP never drifts.
 */
export function generateOdds(): Odds {
  const shuffled = shuffle(PALETTE);
  const odds = {} as Odds;
  BET_NUMBERS.forEach((n, i) => {
    odds[n] = shuffled[i];
  });
  odds[9] = 0;
  return odds;
}

/**
 * Landing probability for every ball. Bet balls get weight ∝ 1/multiplier so
 * every ball has the SAME expected payout (= base RTP); the 9 gets the weight
 * that fixes its probability at BONUS_HIT_CHANCE.
 */
export function landingProbabilities(odds: Odds): Record<BallNumber, number> {
  const inv = BET_NUMBERS.map((n) => 1 / odds[n]);
  const sumInv = inv.reduce((a, b) => a + b, 0);
  const w9 = (sumInv * BONUS_HIT_CHANCE) / (1 - BONUS_HIT_CHANCE);
  const total = sumInv + w9;
  const probs = {} as Record<BallNumber, number>;
  BET_NUMBERS.forEach((n, i) => {
    probs[n] = inv[i] / total;
  });
  probs[9] = w9 / total;
  return probs;
}

/** Pick the landed ball using {@link landingProbabilities}. */
export function pickLandedNumber(odds: Odds): BallNumber {
  const probs = landingProbabilities(odds);
  let roll = Math.random();
  for (const n of BALL_NUMBERS) {
    roll -= probs[n];
    if (roll <= 0) return n;
  }
  return 9;
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
 * On a paid spin, landing the 9 pays nothing but awards free spins. During a
 * free-spin run, re-hitting the 9 retriggers more and the run continues.
 */
export function spin(bets: Bets, odds: Odds, options: SpinOptions = {}): SpinResult {
  const isFreeSpin = options.isFreeSpin ?? false;
  const landed = pickLandedNumber(odds);
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
