# Impostor

A party word game (Spyfall-style), running entirely on **Cloudflare Workers + Durable Objects**.

The host creates a room. Players scan a QR code (or open the link) to join from their own phones. When the host starts the round, each player sees their **secret word privately on their own device** — except the impostor, who either gets a "You're the impostor!" card or (in Variation mode) a slightly different word. Players then describe their word without saying it and vote out the impostor. No email, no shared screen.

## How it works

- **`src/worker.js`** — the Worker. Routes API calls, serves the player join/reveal page (`/r/:roomId`), and defines the `ImpostorRoom` Durable Object that holds each room's state (players, words, impostors). Room state is kept hot in memory and written to storage only on real changes; polling/heartbeats never hit storage. Rooms auto-delete 3 hours after creation.
- **`public/index.html`** — the host UI, served as a static asset at `/`. Create a room, watch the roster fill in, pick a word mode and impostor count, start the round, and reveal the table.
- **`wrangler.toml`** — binds the `ROOMS` Durable Object (SQLite-backed) and points static assets at `public/`.

**Word modes:** Random word (from a built-in list), Custom word, or Variation (impostor gets a different word). **Impostors** are configurable, with a suggested count based on player count. Two host modes: **omniscient** (host sees the word and impostor) or **blind** (both hidden from the host too).

## Develop

```sh
npm install
npm run dev        # wrangler dev — local server at http://localhost:8787
```

Open the host page at `http://localhost:8787/`. To simulate players, open `http://localhost:8787/r/<roomId>` in other tabs (the roomId is in the join URL under the QR code).

## Deploy

```sh
npx wrangler login
npm run deploy
```

The SQLite-backed Durable Object runs on Cloudflare's free plan.

## Legacy

The original email-based version (host enters everyone's name + email, words sent via an external mailer) is preserved in [`legacy/`](legacy/).
