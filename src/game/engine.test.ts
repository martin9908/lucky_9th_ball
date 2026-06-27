import { afterEach, describe, expect, it, vi } from "vitest";
import { spin, totalBet, generateOdds, FREE_SPIN_RANGE, NINE_BALL_BONUS_MULT } from "./engine";
import { BALL_NUMBERS, MULTIPLIER_RANGE, HIGH_MULTIPLIER_RANGE, type Odds } from "./types";

/** Build a full odds map (all balls = 2, the 9 = 0) with optional overrides. */
function makeOdds(overrides: Partial<Odds> = {}): Odds {
  const base = { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 0 } as Odds;
  return { ...base, ...overrides };
}

// With equal weights (1–8 = 10, 9 = 9) the total weight is 89. pickLandedNumber
// rolls Math.random()*89 and walks 1→9, so a given random value lands a known ball.
const LAND_5 = 0.5; // 0.5*89 = 44.5 → ball 5
const LAND_9 = 0.99; // 0.99*89 = 88.1 → ball 9

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
  it("rolls a normal multiplier when the high-roll misses (random high → top of normal range)", () => {
    // 0.99 misses the small high-multiplier chance, then maps to the top of the normal range.
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const odds = generateOdds();
    for (const n of BALL_NUMBERS) {
      if (n === 9) expect(odds[n]).toBe(0);
      else expect(odds[n]).toBe(MULTIPLIER_RANGE.max);
    }
  });

  it("rolls a high multiplier when the high-roll hits (random 0 → bottom of high range)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const odds = generateOdds();
    for (const n of BALL_NUMBERS) {
      if (n === 9) expect(odds[n]).toBe(0);
      else expect(odds[n]).toBe(HIGH_MULTIPLIER_RANGE.min);
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
    expect(result.instantCredit).toBe(0);
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
    expect(result.freeSpinsAwarded).toBe(FREE_SPIN_RANGE.min);
    expect(result.won).toBe(0);
    expect(result.instantCredit).toBe(0);
  });

  it("pays an instant credit when the 9 is re-hit during a free spin", () => {
    vi.spyOn(Math, "random").mockReturnValue(LAND_9);
    const result = spin({ 5: 10 }, makeOdds(), { isFreeSpin: true });
    expect(result.landed).toBe(9);
    expect(result.bonusHit).toBe(false);
    expect(result.freeSpinsAwarded).toBe(0);
    expect(result.instantCredit).toBe(10 * NINE_BALL_BONUS_MULT);
    expect(result.wasFreeSpin).toBe(true);
  });
});

describe("spin — invariants", () => {
  it("always lands on a valid ball with a non-negative payout", () => {
    for (let i = 0; i < 500; i++) {
      const result = spin({ 1: 1, 4: 2, 7: 3 }, generateOdds());
      expect(BALL_NUMBERS).toContain(result.landed);
      expect(result.won).toBeGreaterThanOrEqual(0);
      expect(result.instantCredit).toBeGreaterThanOrEqual(0);
    }
  });
});
