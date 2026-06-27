import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing Supabase config. Copy .env.example to .env and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
  );
}

export const supabase = createClient(url, anonKey);

export interface SpinResponse {
  landed: number;
  odds: number;
  won: number;
  bonusHit: boolean;
  retrigger: boolean;
  freeSpinsAwarded: number;
  wasFreeSpin: boolean;
  totalBet: number;
  credits: number;
  freeSpins: number;
  nextOdds: Record<string, number>;
  nextBets: Record<string, number>;
}

export interface StateResponse {
  credits: number;
  freeSpins: number;
  odds: Record<string, number>;
  bets: Record<string, number>;
}

/** Call the server-authoritative `game` Edge Function. */
async function callGame<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("game", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export const fetchState = () => callGame<StateResponse>({ action: "state" });
export const requestSpin = (bets: Record<string, number>) =>
  callGame<SpinResponse>({ action: "spin", bets });
export const requestRefill = () => callGame<StateResponse>({ action: "refill" });
export const requestAddCredits = () => callGame<StateResponse>({ action: "add-credits" });
