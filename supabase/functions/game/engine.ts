// Server-authoritative game engine for "The 9 Ball".
// Mirrors src/game/* but is the single source of truth: the browser never
// computes outcomes or balances — it only sends bets and renders results.
//
// House-edge model (target RTP ≈ 80%):
//   • A FIXED multiplier palette is shuffled onto balls 1–8 each spin, and each
//     ball's landing weight is ∝ 1/multiplier. That makes the expected value of
//     staking on ANY ball identical (= base RTP), so "bet the hot ball" gives no
//     edge. Because the palette is fixed, that constant never drifts.
//   • The 9 (bonus) lands with fixed probability BONUS_HIT_CHANCE.
//   • A short, bounded free-spin bonus tops the base RTP up to the target.
//   • A hard per-spin win cap and a per-user adaptive throttle bound the tail.

export type BallNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export const BALL_NUMBERS: BallNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const BET_NUMBERS: BallNumber[] = [1, 2, 3, 4, 5, 6, 7, 8];

export type Bets = Partial<Record<BallNumber, number>>;
export type Odds = Record<BallNumber, number>;

/**
 * The eight multipliers in play every spin — only their assignment to balls is
 * randomized. Distinct values keep the board interesting; the lone big one (×25)
 * keeps the "land a monster" thrill while landing proportionally rarely.
 * Σ(1/m) ≈ 1.638, so with BONUS_HIT_CHANCE = 0.10 the base RTP is
 * (1 − 0.10) / 1.638 ≈ 0.55. (See the Monte-Carlo sim in scripts/sim.ts.)
 */
export const PALETTE = [2, 3, 4, 5, 7, 10, 14, 25] as const;

/** Probability the selector lands on the 9 (bonus), on both paid and free spins. */
export const BONUS_HIT_CHANCE = 0.1;

/** Free spins awarded by the first 9-ball hit (on a paid spin). */
export const FREE_SPIN_RANGE = { min: 3, max: 5 } as const;
/** Free spins added when the 9 is re-hit during a free-spin run (retrigger). */
export const RETRIGGER_FREE_SPINS = 1;

/** Hard ceiling on any single spin's payout, as a multiple of that spin's stake.
 * A safety rail: with PALETTE's max ×25 it never binds in normal play (a single
 * ball pays at most 25× its stake), but it guards against future tuning. */
export const MAX_WIN_MULT = 50;

// --- Per-user adaptive throttle (compensated RTP) ---
/** RTP we steer toward. */
export const TARGET_RTP = 0.8;
/** Slack above target before the throttle engages (avoids nudging normal variance). */
export const THROTTLE_BAND = 0.05;
/** Floor on the throttle factor, so a hot player's game never feels broken. */
export const THROTTLE_FLOOR = 0.5;
/** Minimum lifetime wager before the throttle can engage (early variance is noisy). */
export const THROTTLE_MIN_VOLUME = 2000;

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
 * `throttle` (≤ 1) scales the multipliers down for a player who's running hot —
 * the shown odds and the paid odds stay identical, so it's never deceptive.
 */
export function generateOdds(throttle = 1): Odds {
  const shuffled = shuffle(PALETTE);
  const odds = {} as Odds;
  BET_NUMBERS.forEach((n, i) => {
    odds[n] = Math.max(1, Math.round(shuffled[i] * throttle));
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

/**
 * The throttle factor for a player given their lifetime flow. Returns 1 (no
 * throttle) until they've wagered enough and are running above target + band;
 * then it scales toward TARGET_RTP / realizedRTP, clamped to THROTTLE_FLOOR.
 * Pure and total — unit-tested directly.
 */
export function throttleFactor(lifetimeWagered: number, lifetimeWon: number): number {
  if (lifetimeWagered < THROTTLE_MIN_VOLUME) return 1;
  const realized = lifetimeWon / lifetimeWagered;
  if (realized <= TARGET_RTP + THROTTLE_BAND) return 1;
  return Math.max(THROTTLE_FLOOR, TARGET_RTP / realized);
}

export interface PlayerState {
  credits: number;
  freeSpins: number;
  odds: Odds;
  lockedBets: Bets | null;
  /** Accumulated winnings of the current free-spin run (0 outside a run). */
  runWinnings: number;
  /** Lifetime real (paid) stake — the throttle denominator. */
  lifetimeWagered: number;
  /** Lifetime credits won (paid + free spins) — the throttle numerator. */
  lifetimeWon: number;
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

  const landed = pickLandedNumber(odds);
  const isNine = landed === 9;
  const bonusHit = isNine && !isFreeSpin; // first hit starts the run
  const retrigger = isNine && isFreeSpin; // re-hit during the run
  const freeSpinsAwarded = bonusHit
    ? randomInt(FREE_SPIN_RANGE.min, FREE_SPIN_RANGE.max)
    : retrigger
      ? RETRIGGER_FREE_SPINS
      : 0;

  const rawWon = isNine ? 0 : (bets[landed] ?? 0) * odds[landed];
  const won = Math.min(rawWon, MAX_WIN_MULT * stake);

  const credits = state.credits - (isFreeSpin ? 0 : stake) + won;
  const freeSpins = Math.max(0, state.freeSpins - (isFreeSpin ? 1 : 0)) + freeSpinsAwarded;

  // Accumulate winnings during a free-spin run (a paid spin resets the tally).
  const runWinnings = isFreeSpin ? state.runWinnings + won : 0;

  // Lifetime flow: only real (paid) stakes count as wagered; all wins count.
  const lifetimeWagered = state.lifetimeWagered + (isFreeSpin ? 0 : stake);
  const lifetimeWon = state.lifetimeWon + won;

  // Odds and bets re-roll/clear once the round is fully over, but stay locked
  // through a live free-spin run. Fresh odds are throttled by lifetime flow.
  const runLive = freeSpins > 0;
  const throttle = throttleFactor(lifetimeWagered, lifetimeWon);
  const next: PlayerState = {
    credits,
    freeSpins,
    odds: runLive ? odds : generateOdds(throttle),
    lockedBets: runLive ? bets : null,
    runWinnings: runLive ? runWinnings : 0,
    lifetimeWagered,
    lifetimeWon,
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
