import { afterEach, describe, expect, it, vi } from "vitest";
// The authoritative server engine — the cap and per-user throttle live here.
import {
  resolveSpin,
  generateOdds,
  throttleFactor,
  PALETTE,
  MAX_WIN_MULT,
  TARGET_RTP,
  THROTTLE_FLOOR,
  THROTTLE_MIN_VOLUME,
  type Odds,
  type PlayerState,
} from "../../supabase/functions/game/engine";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("throttleFactor (per-user adaptive throttle)", () => {
  it("does not engage below the minimum wager volume", () => {
    // Even running wildly hot, low volume is left alone (early variance is noisy).
    expect(throttleFactor(THROTTLE_MIN_VOLUME - 1, THROTTLE_MIN_VOLUME * 10)).toBe(1);
  });

  it("does not engage while realized RTP is within the target band", () => {
    expect(throttleFactor(100_000, 80_000)).toBe(1); // 0.80, at target
    expect(throttleFactor(100_000, 84_000)).toBe(1); // 0.84, inside band
  });

  it("tightens toward target when a player runs hot", () => {
    // Realized RTP 1.0 → factor pulls toward 0.80.
    expect(throttleFactor(100_000, 100_000)).toBeCloseTo(TARGET_RTP / 1.0, 10);
  });

  it("never drops below the floor", () => {
    // Realized RTP 5.0 would imply 0.16; clamped to the floor.
    expect(throttleFactor(100_000, 500_000)).toBe(THROTTLE_FLOOR);
  });

  it("is monotonically non-increasing as a player wins more", () => {
    let prev = 1;
    for (const won of [80_000, 100_000, 150_000, 200_000, 400_000]) {
      const t = throttleFactor(100_000, won);
      expect(t).toBeLessThanOrEqual(prev);
      prev = t;
    }
  });
});

describe("generateOdds throttle scaling", () => {
  it("at full strength deals the unscaled palette", () => {
    const max = Math.max(...PALETTE);
    let sawMax = false;
    for (let i = 0; i < 200; i++) if (Math.max(...betValues(generateOdds(1))) === max) sawMax = true;
    expect(sawMax).toBe(true);
  });

  it("scales every multiplier down for a throttled player", () => {
    const odds = generateOdds(0.5);
    const vals = betValues(odds);
    expect(Math.max(...vals)).toBeLessThan(Math.max(...PALETTE)); // ×25 → ~13
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(1);
    expect(odds[9]).toBe(0);
  });
});

describe("resolveSpin — max win per spin cap", () => {
  it("clamps a single spin's payout to MAX_WIN_MULT × stake", () => {
    // Artificially rich odds so the raw win blows past the cap.
    const odds = { 1: 1000, 2: 1000, 3: 1000, 4: 1000, 5: 1000, 6: 1000, 7: 1000, 8: 1000, 9: 0 } as Odds;
    const state: PlayerState = {
      credits: 1_000_000,
      freeSpins: 0,
      odds,
      lockedBets: null,
      runWinnings: 0,
      lifetimeWagered: 0,
      lifetimeWon: 0,
    };
    const bets = { 1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 6: 10, 7: 10, 8: 10 }; // stake 80
    vi.spyOn(Math, "random").mockReturnValue(0.0001); // lands ball 1 (bet, non-9)

    const out = resolveSpin(state, bets);
    expect(out.landed).toBe(1);
    // raw would be 10 × 1000 = 10_000; capped to 50 × 80 = 4_000.
    expect(out.won).toBe(MAX_WIN_MULT * 80);
  });
});

function betValues(odds: Odds): number[] {
  return [1, 2, 3, 4, 5, 6, 7, 8].map((n) => odds[n as keyof Odds]);
}
