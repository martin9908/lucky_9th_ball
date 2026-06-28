import { afterEach, describe, expect, it, vi } from "vitest";
import {
  spin,
  totalBet,
  generateOdds,
  landingProbabilities,
  FREE_SPIN_RANGE,
  RETRIGGER_FREE_SPINS,
} from "./engine";
import { BALL_NUMBERS, BET_NUMBERS, PALETTE, BONUS_HIT_CHANCE, type BallNumber, type Bets, type Odds } from "./types";

/** Build a full odds map (all balls = 2, the 9 = 0) with optional overrides. */
function makeOdds(overrides: Partial<Odds> = {}): Odds {
  const base = { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 0 } as Odds;
  return { ...base, ...overrides };
}

// The Math.random value that makes pickLandedNumber land on `target`, derived
// from the live landing probabilities so the tests follow any odds.
function landRandom(target: BallNumber, odds: Odds): number {
  const probs = landingProbabilities(odds);
  let before = 0;
  for (const n of BALL_NUMBERS) {
    if (n === target) return before + probs[n] / 2;
    before += probs[n];
  }
  return before + probs[9] / 2;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("totalBet", () => {
  it("sums all staked tokens", () => {
    expect(totalBet({ 1: 5, 3: 10, 8: 2 })).toBe(17);
  });

  it("is 0 with no bets", () => {
    expect(totalBet({})).toBe(0);
  });
});

describe("generateOdds", () => {
  it("deals the fixed palette across the bet balls (the 9 is always 0)", () => {
    const sortedPalette = [...PALETTE].sort((a, b) => a - b);
    for (let i = 0; i < 300; i++) {
      const odds = generateOdds();
      const values = BET_NUMBERS.map((n) => odds[n]);
      // A permutation of the palette: distinct, and the same multiset every spin.
      expect(new Set(values).size).toBe(BET_NUMBERS.length);
      expect([...values].sort((a, b) => a - b)).toEqual(sortedPalette);
      expect(odds[9]).toBe(0);
    }
  });
});

describe("landingProbabilities — the house edge", () => {
  it("fixes the 9 (bonus) probability at BONUS_HIT_CHANCE", () => {
    const probs = landingProbabilities(generateOdds());
    expect(probs[9]).toBeCloseTo(BONUS_HIT_CHANCE, 10);
  });

  it("is a proper distribution (sums to 1)", () => {
    const probs = landingProbabilities(generateOdds());
    const sum = BALL_NUMBERS.reduce((s, n) => s + probs[n], 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("gives every bet ball the SAME expected value (no 'hot ball' edge)", () => {
    const odds = generateOdds();
    const probs = landingProbabilities(odds);
    const evs = BET_NUMBERS.map((n) => probs[n] * odds[n]);
    const first = evs[0];
    for (const ev of evs) expect(ev).toBeCloseTo(first, 10);
    // That constant IS the base RTP: (1 − p9) / Σ(1/m) ≈ 0.55 for this palette.
    const sumInv = PALETTE.reduce((s, m) => s + 1 / m, 0);
    expect(first).toBeCloseTo((1 - BONUS_HIT_CHANCE) / sumInv, 10);
  });
});

describe("spin — payouts", () => {
  it("pays stake × the landed ball's odds when you've bet it", () => {
    const odds = makeOdds({ 5: 7 });
    vi.spyOn(Math, "random").mockReturnValue(landRandom(5, odds));
    const result = spin({ 5: 10 }, odds);
    expect(result.landed).toBe(5);
    expect(result.odds).toBe(7);
    expect(result.won).toBe(70);
    expect(result.bonusHit).toBe(false);
    expect(result.retrigger).toBe(false);
    expect(result.totalBet).toBe(10);
  });

  it("pays nothing when the landed ball wasn't bet", () => {
    const odds = makeOdds({ 5: 7 });
    vi.spyOn(Math, "random").mockReturnValue(landRandom(5, odds));
    const result = spin({ 3: 10 }, odds);
    expect(result.landed).toBe(5);
    expect(result.won).toBe(0);
  });
});

describe("spin — the 9 ball", () => {
  it("awards free spins when the 9 lands on a paid spin", () => {
    const odds = makeOdds();
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(landRandom(9, odds)) // pick the 9
      .mockReturnValueOnce(0); // free-spin count → minimum
    const result = spin({ 5: 10 }, odds);
    expect(result.landed).toBe(9);
    expect(result.bonusHit).toBe(true);
    expect(result.retrigger).toBe(false);
    expect(result.freeSpinsAwarded).toBe(FREE_SPIN_RANGE.min);
    expect(result.won).toBe(0);
  });

  it("retriggers free spins when the 9 is re-hit during a free spin", () => {
    const odds = makeOdds();
    vi.spyOn(Math, "random").mockReturnValue(landRandom(9, odds));
    const result = spin({ 5: 10 }, odds, { isFreeSpin: true });
    expect(result.landed).toBe(9);
    expect(result.bonusHit).toBe(false);
    expect(result.retrigger).toBe(true);
    expect(result.freeSpinsAwarded).toBe(RETRIGGER_FREE_SPINS);
    expect(result.won).toBe(0);
    expect(result.wasFreeSpin).toBe(true);
  });
});

describe("spin — invariants", () => {
  it("always lands on a valid ball with a non-negative payout", () => {
    for (let i = 0; i < 500; i++) {
      const result = spin({ 1: 1, 4: 2, 7: 3 }, generateOdds());
      expect(BALL_NUMBERS).toContain(result.landed);
      expect(result.won).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("RTP (Monte-Carlo) — house edge holds across betting strategies", () => {
  /** Play `spins` paid rounds with a strategy and return realized RTP. */
  function realizedRtp(chooseBets: (odds: Odds) => Bets, spins: number): number {
    let wagered = 0;
    let won = 0;
    for (let i = 0; i < spins; i++) {
      const odds = generateOdds();
      const bets = chooseBets(odds);
      wagered += totalBet(bets);
      const res = spin(bets, odds);
      won += res.won;
      // Resolve the free-spin run (locked bets + odds, no extra wager).
      let free = res.bonusHit ? res.freeSpinsAwarded : 0;
      while (free > 0) {
        free -= 1;
        const fr = spin(bets, odds, { isFreeSpin: true });
        won += fr.won;
        if (fr.retrigger) free += fr.freeSpinsAwarded;
      }
    }
    return won / wagered;
  }

  const SPINS = 200_000;
  const strategies: Record<string, (odds: Odds) => Bets> = {
    spreadAll: () => ({ 1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 6: 10, 7: 10, 8: 10 }),
    singleFixed: () => ({ 1: 80 }),
    // The "exploit": always pile onto the highest multiplier shown.
    chaseMax: (odds) => {
      const best = BET_NUMBERS.reduce((a, b) => (odds[b] > odds[a] ? b : a));
      return { [best]: 80 };
    },
    chaseMin: (odds) => {
      const worst = BET_NUMBERS.reduce((a, b) => (odds[b] < odds[a] ? b : a));
      return { [worst]: 80 };
    },
  };

  for (const [name, strat] of Object.entries(strategies)) {
    it(`${name} lands near the ~79% target`, () => {
      const rtp = realizedRtp(strat, SPINS);
      // Wide-ish band to absorb Monte-Carlo noise; the exact strategy-independence
      // is proven deterministically by the landingProbabilities tests above.
      expect(rtp).toBeGreaterThan(0.74);
      expect(rtp).toBeLessThan(0.85);
    });
  }
});
