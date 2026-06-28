// Server-authoritative game engine for "The 9 Ball".
// Mirrors src/game/* but is the single source of truth: the browser never
// computes outcomes or balances — it only sends bets and renders results.

export type BallNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export const BALL_NUMBERS: BallNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const BET_NUMBERS: BallNumber[] = [1, 2, 3, 4, 5, 6, 7, 8];

export type Bets = Partial<Record<BallNumber, number>>;
export type Odds = Record<BallNumber, number>;

// Landing weights: balls 1–8 equally likely, the 9 (jackpot/bonus) tuned for its
// hit rate. At weight 20 with 1–8 = 10 each (total 100) the 9 lands ~20%.
const WEIGHTS: Record<BallNumber, number> = { 1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 6: 10, 7: 10, 8: 10, 9: 20 };
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
  /** Accumulated winnings of the current free-spin run (0 outside a run). */
  runWinnings: number;
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
  /** Running total of the free-spin run after this spin (the Credit Out tally). */
  runWinnings: number;
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

  // Accumulate winnings during a free-spin run (a paid spin resets the tally).
  // This is the Credit Out figure; reported even on the final spin so the client
  // can cash out the whole total, then persisted back to 0 once the run is over.
  const runWinnings = isFreeSpin ? state.runWinnings + won : 0;

  // Odds and bets re-roll/clear once the round is fully over, but stay locked
  // through a live free-spin run.
  const runLive = freeSpins > 0;
  const next: PlayerState = {
    credits,
    freeSpins,
    odds: runLive ? odds : generateOdds(),
    lockedBets: runLive ? bets : null,
    runWinnings: runLive ? runWinnings : 0,
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
    runWinnings,
    next,
  };
}
