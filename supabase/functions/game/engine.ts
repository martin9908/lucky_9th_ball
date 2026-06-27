// Server-authoritative game engine for "The 9 Ball".
// Mirrors src/game/* but is the single source of truth: the browser never
// computes outcomes or balances — it only sends bets and renders results.

export type BallNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export const BALL_NUMBERS: BallNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const BET_NUMBERS: BallNumber[] = [1, 2, 3, 4, 5, 6, 7, 8];

export type Bets = Partial<Record<BallNumber, number>>;
export type Odds = Record<BallNumber, number>;

// Landing weights: balls 1–8 equally likely, the 9 (bonus) tuned separately.
const WEIGHTS: Record<BallNumber, number> = { 1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 6: 10, 7: 10, 8: 10, 9: 9 };
const TOTAL_WEIGHT = BALL_NUMBERS.reduce((sum, n) => sum + WEIGHTS[n], 0);

export const MULTIPLIER_RANGE = { min: 2, max: 14 };
export const HIGH_MULTIPLIER_RANGE = { min: 20, max: 50 };
export const HIGH_MULTIPLIER_CHANCE = 0.03;
/** Free spins awarded by the first 9-ball hit (on a paid spin). */
export const FREE_SPIN_RANGE = { min: 10, max: 15 };
/** Free spins added when the 9 is re-hit during a free-spin run (retrigger). */
export const RETRIGGER_FREE_SPINS = 3;

function randomInt(minInclusive: number, maxInclusive: number): number {
  return Math.floor(Math.random() * (maxInclusive - minInclusive + 1)) + minInclusive;
}

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

function pickLandedNumber(): BallNumber {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const n of BALL_NUMBERS) {
    roll -= WEIGHTS[n];
    if (roll <= 0) return n;
  }
  return BALL_NUMBERS[0];
}

/** Keep only valid bet positions with positive integer stakes. */
export function sanitizeBets(raw: unknown): Bets {
  const bets: Bets = {};
  if (!raw || typeof raw !== "object") return bets;
  for (const n of BET_NUMBERS) {
    const v = (raw as Record<string, unknown>)[String(n)];
    const amount = Math.floor(Number(v));
    if (Number.isFinite(amount) && amount > 0) bets[n] = amount;
  }
  return bets;
}

export function totalBet(bets: Bets): number {
  return Object.values(bets).reduce((sum, chips) => sum + (chips ?? 0), 0);
}

export interface PlayerState {
  credits: number;
  freeSpins: number;
  odds: Odds;
  lockedBets: Bets | null;
}

export interface SpinOutcome {
  landed: BallNumber;
  odds: number;
  won: number;
  /** The first 9-ball hit on a paid spin (starts the free-spin run). */
  bonusHit: boolean;
  /** The 9 re-hit during a free-spin run (adds more free spins). */
  retrigger: boolean;
  freeSpinsAwarded: number;
  wasFreeSpin: boolean;
  totalBet: number;
  // Authoritative next state to persist and return to the client.
  next: PlayerState;
}

/**
 * Resolve one spin against the player's authoritative state. `requestedBets` is
 * ignored during a free-spin run (the locked bets are reused instead).
 */
export function resolveSpin(state: PlayerState, requestedBets: Bets): SpinOutcome {
  const isFreeSpin = state.freeSpins > 0;
  const bets = isFreeSpin ? (state.lockedBets ?? {}) : requestedBets;
  const stake = totalBet(bets);
  const odds = state.odds;

  const landed = pickLandedNumber();
  const isNine = landed === 9;
  const bonusHit = isNine && !isFreeSpin; // first hit starts the run (10–15)
  const retrigger = isNine && isFreeSpin; // re-hit during the run (+3)
  const freeSpinsAwarded = bonusHit
    ? randomInt(FREE_SPIN_RANGE.min, FREE_SPIN_RANGE.max)
    : retrigger
      ? RETRIGGER_FREE_SPINS
      : 0;
  const won = isNine ? 0 : (bets[landed] ?? 0) * odds[landed];

  const credits = state.credits - (isFreeSpin ? 0 : stake) + won;
  const freeSpins = Math.max(0, state.freeSpins - (isFreeSpin ? 1 : 0)) + freeSpinsAwarded;

  // Odds and bets re-roll/clear once the round is fully over, but stay locked
  // through a live free-spin run.
  const runLive = freeSpins > 0;
  const next: PlayerState = {
    credits,
    freeSpins,
    odds: runLive ? odds : generateOdds(),
    lockedBets: runLive ? bets : null,
  };

  return {
    landed,
    odds: odds[landed],
    won,
    bonusHit,
    retrigger,
    freeSpinsAwarded,
    wasFreeSpin: isFreeSpin,
    totalBet: stake,
    next,
  };
}
