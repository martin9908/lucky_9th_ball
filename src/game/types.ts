export type BallNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** Every ball the selector can land on (fills the 3×3 playfield). */
export const BALL_NUMBERS: BallNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Balls you can actually place tokens on. The 9 is the bonus ball, not a bet. */
export const BET_NUMBERS: BallNumber[] = [1, 2, 3, 4, 5, 6, 7, 8];

/** Visual metadata for a single ball, mirroring the real cabinet. */
export interface BallInfo {
  num: BallNumber;
  /** Billiard-ball colour. */
  color: string;
  /** Number printed in the white centre disc. */
  textColor: string;
  /** Striped (white ball with a colour band) vs. a solid colour ball. */
  striped: boolean;
}

/**
 * The eight multipliers in play every spin — only their assignment to balls is
 * randomized (see engine.generateOdds). Each ball's landing odds are ∝
 * 1/multiplier, so every ball has the same expected value: betting the "hot"
 * ball is no edge. The lone ×25 keeps the jackpot thrill while landing rarely.
 * Mirrors PALETTE in supabase/functions/game/engine.ts (the source of truth).
 */
export const PALETTE = [2, 3, 4, 5, 7, 10, 14, 25] as const;

/** Probability the selector lands on the 9 (bonus), each spin. */
export const BONUS_HIT_CHANCE = 0.1;

/** Multipliers at or below this are "normal" (red LED); above it is a jackpot
 * (gold LED). With the palette above, only the ×25 ball lights gold. */
export const MULTIPLIER_RANGE = { min: 2, max: 14 } as const;

/** The single jackpot multiplier in the palette (the gold ball). */
export const JACKPOT_MULTIPLIER = Math.max(...PALETTE);

/**
 * Standard pool-ball colours. The 9 pays nothing directly: landing on it awards
 * free spins, or continues a free-spin run.
 */
export const BALLS: Record<BallNumber, BallInfo> = {
  1: { num: 1, color: "#eab308", textColor: "#1f2937", striped: false },
  2: { num: 2, color: "#1d4ed8", textColor: "#1f2937", striped: false },
  3: { num: 3, color: "#dc2626", textColor: "#1f2937", striped: false },
  4: { num: 4, color: "#6d28d9", textColor: "#1f2937", striped: false },
  5: { num: 5, color: "#ea580c", textColor: "#1f2937", striped: false },
  6: { num: 6, color: "#15803d", textColor: "#1f2937", striped: false },
  7: { num: 7, color: "#7f1d1d", textColor: "#1f2937", striped: false },
  8: { num: 8, color: "#111827", textColor: "#1f2937", striped: false },
  9: { num: 9, color: "#eab308", textColor: "#1f2937", striped: true },
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
  /** True when the 9 is re-hit during a free-spin run — adds more free spins. */
  retrigger: boolean;
  /** Free spins awarded this spin (initial bonus or retrigger; 0 if none). */
  freeSpinsAwarded: number;
  /** True if this spin itself was a free (bonus) spin. */
  wasFreeSpin: boolean;
}
