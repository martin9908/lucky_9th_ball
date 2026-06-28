import { afterEach, describe, expect, it, vi } from "vitest";
import { spin, totalBet, generateOdds, FREE_SPIN_RANGE, RETRIGGER_FREE_SPINS } from "./engine";
import { BALL_NUMBERS, BET_NUMBERS, BALLS, MULTIPLIER_RANGE, HIGH_MULTIPLIER_RANGE, type BallNumber, type Odds } from "./types";

/** Build a full odds map (all balls = 2, the 9 = 0) with optional overrides. */
function makeOdds(overrides: Partial<Odds> = {}): Odds {
  const base = { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 0 } as Odds;
  return { ...base, ...overrides };
}

// The Math.random value that makes pickLandedNumber land on `target`, derived
// from the live weights so the tests don't break when a weight is tuned.
const TOTAL_WEIGHT = BALL_NUMBERS.reduce((sum, n) => sum + BALLS[n].weight, 0);
function landRandom(target: BallNumber): number {
  let before = 0;
  for (const n of BALL_NUMBERS) {
    if (n === target) break;
    before += BALLS[n].weight;
  }
  return (before + BALLS[target].weight / 2) / TOTAL_WEIGHT;
}
const LAND_5 = landRandom(5);
const LAND_9 = landRandom(9);

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
  it("gives every bet ball a distinct multiplier (the 9 is always 0)", () => {
    for (let i = 0; i < 300; i++) {
      const odds = generateOdds();
      const values = BET_NUMBERS.map((n) => odds[n]);
      expect(new Set(values).size).toBe(BET_NUMBERS.length);
      expect(odds[9]).toBe(0);
    }
  });

  it("always lands in the normal or high range over many rolls", () => {
    for (let i = 0; i < 300; i++) {
      const odds = generateOdds();
      for (const n of BALL_NUMBERS) {
        if (n === 9) {
          expect(odds[n]).toBe(0);
          continue;
        }
        const inNormal = odds[n] >= MULTIPLIER_RANGE.min && odds[n] <= MULTIPLIER_RANGE.max;
        const inHigh = odds[n] >= HIGH_MULTIPLIER_RANGE.min && odds[n] <= HIGH_MULTIPLIER_RANGE.max;
        expect(inNormal || inHigh).toBe(true);
      }
    }
  });
});

describe("spin — payouts", () => {
  it("pays stake × the landed ball's odds when you've bet it", () => {
    vi.spyOn(Math, "random").mockReturnValue(LAND_5);
    const result = spin({ 5: 10 }, makeOdds({ 5: 7 }));
    expect(result.landed).toBe(5);
    expect(result.odds).toBe(7);
    expect(result.won).toBe(70);
    expect(result.bonusHit).toBe(false);
    expect(result.retrigger).toBe(false);
    expect(result.totalBet).toBe(10);
  });

  it("pays nothing when the landed ball wasn't bet", () => {
    vi.spyOn(Math, "random").mockReturnValue(LAND_5);
    const result = spin({ 3: 10 }, makeOdds({ 5: 7 }));
    expect(result.landed).toBe(5);
    expect(result.won).toBe(0);
  });
});

describe("spin — the 9 ball", () => {
  it("awards free spins when the 9 lands on a paid spin", () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(LAND_9) // pick the 9
      .mockReturnValueOnce(0); // free-spin count → minimum
    const result = spin({ 5: 10 }, makeOdds());
    expect(result.landed).toBe(9);
    expect(result.bonusHit).toBe(true);
    expect(result.retrigger).toBe(false);
    expect(result.freeSpinsAwarded).toBe(FREE_SPIN_RANGE.min);
    expect(result.won).toBe(0);
  });

  it("retriggers +3 free spins when the 9 is re-hit during a free spin", () => {
    vi.spyOn(Math, "random").mockReturnValue(LAND_9);
    const result = spin({ 5: 10 }, makeOdds(), { isFreeSpin: true });
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
