// Monte-Carlo RTP simulation for The 9 Ball's house-edge model.
//
// Confirms the redesigned engine returns ≈80% to players regardless of betting
// strategy (the inverse-weighted odds make every ball equal-EV, so no strategy
// beats the house). Measures the un-throttled base game; the per-user throttle
// only pulls outliers further down.
//
//   npx tsx scripts/sim.ts            # default 5,000,000 spins/strategy
//   npx tsx scripts/sim.ts 1000000    # custom spin count
//
// (Or: node --experimental-strip-types scripts/sim.ts)
import { spin, generateOdds, totalBet } from "../src/game/engine.ts";
import { BET_NUMBERS, type Bets, type Odds } from "../src/game/types.ts";

const SPINS = Number(process.argv[2]) || 5_000_000;

const strategies: Record<string, (odds: Odds) => Bets> = {
  "spread all 8": () => ({ 1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 6: 10, 7: 10, 8: 10 }),
  "single ball": () => ({ 1: 80 }),
  "chase highest": (odds) => ({ [BET_NUMBERS.reduce((a, b) => (odds[b] > odds[a] ? b : a))]: 80 }),
  "chase lowest": (odds) => ({ [BET_NUMBERS.reduce((a, b) => (odds[b] < odds[a] ? b : a))]: 80 }),
  random: () => ({ [BET_NUMBERS[Math.floor(Math.random() * BET_NUMBERS.length)]]: 80 }),
};

function run(chooseBets: (odds: Odds) => Bets, spins: number) {
  let wagered = 0;
  let won = 0;
  let bonuses = 0;
  let freeSpins = 0;
  for (let i = 0; i < spins; i++) {
    const odds = generateOdds();
    const bets = chooseBets(odds);
    wagered += totalBet(bets);
    const res = spin(bets, odds);
    won += res.won;
    let free = res.bonusHit ? res.freeSpinsAwarded : 0;
    if (res.bonusHit) bonuses += 1;
    while (free > 0) {
      free -= 1;
      freeSpins += 1;
      const fr = spin(bets, odds, { isFreeSpin: true });
      won += fr.won;
      if (fr.retrigger) free += fr.freeSpinsAwarded;
    }
  }
  return { rtp: won / wagered, avgRun: bonuses ? freeSpins / bonuses : 0 };
}

console.log(`The 9 Ball — RTP simulation (${SPINS.toLocaleString()} spins/strategy)\n`);
for (const [name, strat] of Object.entries(strategies)) {
  const { rtp, avgRun } = run(strat, SPINS);
  console.log(`  ${name.padEnd(14)} RTP ${(rtp * 100).toFixed(2)}%   house edge ${((1 - rtp) * 100).toFixed(2)}%   avg free-spin run ${avgRun.toFixed(2)}`);
}
