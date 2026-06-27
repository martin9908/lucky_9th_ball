# The 9 Ball — Accounts setup (Supabase)

Player accounts + credits are **server-authoritative**: the browser only sends
bets and renders results. Spins, RNG, and balances are computed in a Supabase
Edge Function and stored in Postgres, so credits can't be edited from the client.

You need a (free) Supabase project. These steps take ~10 minutes.

## 1. Create the project & wire up keys

1. Create a project at <https://supabase.com> (note your **project ref** — the
   `xxxx` in `xxxx.supabase.co`).
2. In **Project Settings → API**, copy the **Project URL** and the **anon public** key.
3. Copy the env template and fill it in:

   ```bash
   cp .env.example .env
   # then edit .env:
   # VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   # VITE_SUPABASE_ANON_KEY=<anon public key>
   ```

## 2. Enable email auth

- **Authentication → Providers → Email**: make sure it's enabled.
- For quick local testing, turn **"Confirm email" off** so a sign-up logs you
  straight in. (Leave it on for production; the login screen already handles the
  "check your email" case.)

## 3. Create the table (run the migration)

Open **SQL Editor** in the dashboard, paste the contents of
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), and run it.
This creates the `profiles` table, its read-only RLS policy, and the trigger that
gives every new user a row with 100 starting credits.

## 4. Deploy the Edge Function

Install the CLI (<https://supabase.com/docs/guides/cli>), then:

```bash
supabase login
supabase link --project-ref <project-ref>   # run `supabase init` first if it asks for config
supabase functions deploy game
```

No secrets to set: Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` into the function automatically.

## 5. Run it

```bash
npm install
npm run dev
```

Sign up, and you should land on the table with 100 credits. Place bets, spin, and
the balance updates from the server. Refresh or open another device with the same
account — your credits follow you.

## Mobile app (Capacitor)

The same web build ships as native iOS & Android apps via a WebView — no separate
codebase. `capacitor.config.ts` points Capacitor at Vite's `dist/`.

```bash
# Rebuild the web bundle and copy it into the native projects
npm run cap:sync

# Open the native project to run on a simulator/device
npm run cap:ios       # opens Xcode (needs Xcode + CocoaPods)
npm run cap:android   # opens Android Studio (needs Android Studio + a JDK Gradle supports)
```

Run `cap:sync` (or `cap:ios`/`cap:android`) any time you change the web app — it
re-bundles and copies the assets into `ios/` and `android/`.

Notes:
- **App id** is `com.the9ball.app` (in `capacitor.config.ts`). Change it *before*
  the first `cap add` if you want a different bundle id; after that it's baked into
  the native projects.
- The app talks to the **same Supabase backend** over HTTPS — nothing server-side
  changes. The anon key in the bundle is public by design.
- The Android `cap add` showed a Gradle/JDK warning on this machine ("Unsupported
  class file major version") — that's just a too-new local JDK; open the project in
  Android Studio, let it pick a compatible JDK, and sync Gradle there.

## How it works

- `supabase/functions/game/` — the authoritative engine + handler (`state`,
  `spin`, `refill` actions). This is the real game logic.
- `src/game/` — the same rules mirrored client-side, used for the help text and
  unit tests (`npm test`). The server is the source of truth.
- `profiles` rows are written **only** by the function (service role); clients can
  read their own row but never write it.
