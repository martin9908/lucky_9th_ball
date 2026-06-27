// Supabase Edge Function: server-authoritative game endpoint for "The 9 Ball".
// Actions:
//   { action: "state" }          → current credits / free spins / offered odds
//   { action: "spin", bets }     → resolve a spin and return the new state
//
// The client authenticates with its JWT; all reads/writes to `profiles` use the
// service-role key so the browser can never set its own balance.

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  generateOdds,
  resolveSpin,
  sanitizeBets,
  totalBet,
  type Odds,
  type PlayerState,
} from "./engine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface ProfileRow {
  credits: number;
  free_spins: number;
  current_odds: Odds | null;
  locked_bets: Record<string, number> | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // Identify the caller from their JWT.
    const authHeader = req.headers.get("Authorization") ?? "";
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: row, error: readError } = await admin
      .from("profiles")
      .select("credits, free_spins, current_odds, locked_bets")
      .eq("id", user.id)
      .single<ProfileRow>();
    if (readError || !row) return json({ error: "Profile not found" }, 404);

    // Ensure odds exist (first load after signup).
    let odds = row.current_odds;
    if (!odds) {
      odds = generateOdds();
      await admin.from("profiles").update({ current_odds: odds, updated_at: new Date().toISOString() }).eq("id", user.id);
    }

    const state: PlayerState = {
      credits: row.credits,
      freeSpins: row.free_spins,
      odds,
      lockedBets: row.locked_bets ?? null,
    };

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "state") {
      return json({
        credits: state.credits,
        freeSpins: state.freeSpins,
        odds: state.odds,
        bets: state.lockedBets ?? {},
      });
    }

    if (action === "spin") {
      const isFreeSpin = state.freeSpins > 0;
      const bets = isFreeSpin ? (state.lockedBets ?? {}) : sanitizeBets(body?.bets);
      const stake = totalBet(bets);

      if (!isFreeSpin) {
        if (stake <= 0) return json({ error: "No bet placed" }, 400);
        if (stake > state.credits) return json({ error: "Insufficient credits" }, 400);
      }

      const outcome = resolveSpin(state, bets);

      const { error: writeError } = await admin
        .from("profiles")
        .update({
          credits: outcome.next.credits,
          free_spins: outcome.next.freeSpins,
          current_odds: outcome.next.odds,
          locked_bets: outcome.next.lockedBets,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      if (writeError) return json({ error: "Failed to save game state" }, 500);

      return json({
        landed: outcome.landed,
        odds: outcome.odds,
        won: outcome.won,
        bonusHit: outcome.bonusHit,
        freeSpinsAwarded: outcome.freeSpinsAwarded,
        instantCredit: outcome.instantCredit,
        wasFreeSpin: outcome.wasFreeSpin,
        totalBet: outcome.totalBet,
        // New authoritative state for the client to display after the chase.
        credits: outcome.next.credits,
        freeSpins: outcome.next.freeSpins,
        nextOdds: outcome.next.odds,
        nextBets: outcome.next.lockedBets ?? {},
      });
    }

    if (action === "add-credits") {
      // Free top-up (no payment) — for testing / free-play. Adds a fixed amount.
      const ADD_AMOUNT = 10;
      const credits = state.credits + ADD_AMOUNT;
      await admin
        .from("profiles")
        .update({ credits, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      return json({
        credits,
        freeSpins: state.freeSpins,
        odds: state.odds,
        bets: state.lockedBets ?? {},
      });
    }

    if (action === "refill") {
      if (state.credits > 0 || state.freeSpins > 0) {
        return json({ error: "Refill is only available when you're out of credits" }, 400);
      }
      const freshOdds = generateOdds();
      await admin
        .from("profiles")
        .update({
          credits: 100,
          free_spins: 0,
          current_odds: freshOdds,
          locked_bets: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      return json({ credits: 100, freeSpins: 0, odds: freshOdds, bets: {} });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
