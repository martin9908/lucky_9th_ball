export type BallNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** Every ball the selector can land on (fills the 3×3 playfield). */
export const BALL_NUMBERS: BallNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Balls you can actually place tokens on. The 9 is the bonus ball, not a bet. */
export const BET_NUMBERS: BallNumber[] = [1, 2, 3, 4, 5, 6, 7, 8];

/** Visual + odds metadata for a single ball, mirroring the real cabinet. */
export interface BallInfo {
  num: BallNumber;
  /** Relative likelihood the selector lands here. */
  weight: number;
  /** Billiard-ball colour. */
  color: string;
  /** Number printed in the white centre disc. */
  textColor: string;
  /** Striped (white ball with a colour band) vs. a solid colour ball. */
  striped: boolean;
}

/**
 * Shared multiplier range — every ball 1–8 re-rolls within this each spin (the
 * 9 always pays 0). With balls 1–8 equally likely (~11% each) the average
 * payout works out to a modest house edge; widen this to be more generous.
 */
export const MULTIPLIER_RANGE = { min: 2, max: 14 } as const;

/** Rare "jackpot" multiplier — occasionally a ball rolls from this richer band. */
export const HIGH_MULTIPLIER_RANGE = { min: 20, max: 50 } as const;

/** Per-ball chance, each spin, of rolling a high multiplier instead of the normal one. */
export const HIGH_MULTIPLIER_CHANCE = 0.03;

/**
 * Standard pool-ball colours. Each spin every ball's multiplier is re-rolled
 * randomly within MULTIPLIER_RANGE (no ball is inherently low or high), and
 * balls 1–8 are all equally likely to land — pure chance, no exploit. The 9
 * pays nothing directly: landing on it awards free spins, or an instant credit
 * if hit during a free-spin run.
 */
export const BALLS: Record<BallNumber, BallInfo> = {
  1: { num: 1, weight: 10, color: "#eab308", textColor: "#1f2937", striped: false },
  2: { num: 2, weight: 10, color: "#1d4ed8", textColor: "#1f2937", striped: false },
  3: { num: 3, weight: 10, color: "#dc2626", textColor: "#1f2937", striped: false },
  4: { num: 4, weight: 10, color: "#6d28d9", textColor: "#1f2937", striped: false },
  5: { num: 5, weight: 10, color: "#ea580c", textColor: "#1f2937", striped: false },
  6: { num: 6, weight: 10, color: "#15803d", textColor: "#1f2937", striped: false },
  7: { num: 7, weight: 10, color: "#7f1d1d", textColor: "#1f2937", striped: false },
  8: { num: 8, weight: 10, color: "#111827", textColor: "#1f2937", striped: false },
  9: { num: 9, weight: 9, color: "#eab308", textColor: "#1f2937", striped: true },
};

/** Tokens placed on each number. Missing key = no bet. */
export type Bets = Partial<Record<BallNumber, number>>;

/** Current payout multiplier for every ball this spin (9 is always 0). */
export type Odds = Record<BallNumber, number>;

export interface SpinResult {
  /** The number the selector landed on. */
  landed: BallNumber;
  /** Odds (multiplier) of the landed ball. 0 for the 9 (bonus) ball. */
  odds: number;
  /** Total amount bet across all numbers this round. */
  totalBet: number;
  /** Amount won (your stake on the landed ball × its odds; 0 if not bet). */
  won: number;
  /** True when the selector landed on the 9 ball on a paid spin — starts the bonus. */
  bonusHit: boolean;
  /** Free spins awarded by the bonus (0 if none). */
  freeSpinsAwarded: number;
  /** Flat credit paid when the 9 is re-hit during a free-spin run (0 otherwise). */
  instantCredit: number;
  /** True if this spin itself was a free (bonus) spin. */
  wasFreeSpin: boolean;
}
