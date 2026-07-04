/**
 * Impostor — party word game on Cloudflare Workers + Durable Objects.
 *
 * The host creates a room; players join from their phones via QR code / link and
 * see their secret word on their own device. One or more impostors either get a
 * "You're the impostor!" card (same-word modes) or a *different* word (variation
 * mode). Players then describe the word without saying it and vote out the impostor.
 * No email needed — everything is revealed per-device.
 *
 * Routes:
 *   POST /api/rooms                       -> host creates a room -> {roomId, hostMode}
 *   GET  /r/:roomId                       -> player join + reveal page (QR target)
 *   POST /api/rooms/:roomId/join          -> player submits {name} -> {playerId}
 *   GET  /api/rooms/:roomId/players       -> host polls roster (names + presence)
 *   POST /api/rooms/:roomId/start         -> host assigns words + picks impostors
 *   GET  /api/rooms/:roomId/table         -> host view (words + who's the impostor)
 *   GET  /api/rooms/:roomId/me/:playerId  -> player polls for their own word
 *   POST /api/rooms/:roomId/remove/:pid   -> host removes a player from the lobby
 *
 * Binding (wrangler.toml): durable_objects "ROOMS" -> class "ImpostorRoom".
 */

// Built-in word list for "Random word" mode.
const WORDS = [
  "apple", "banana", "cherry", "dog", "elephant", "fish", "guitar", "house", "ice", "jacket",
  "kite", "lemon", "mountain", "notebook", "ocean", "piano", "queen", "robot", "sun", "tree",
  "umbrella", "violin", "whale", "xylophone", "yacht", "zebra", "airplane", "bicycle", "camera",
  "dolphin", "eagle", "forest", "grape", "helicopter", "island", "jungle", "kangaroo", "lamp",
  "moon", "nest", "orange", "penguin", "quilt", "rainbow", "star", "tiger", "unicorn", "vase",
  "wolf", "x-ray", "yogurt", "zeppelin", "ant", "bridge", "cloud", "dragon", "engine", "flower",
  "globe", "hat", "igloo", "jewel", "lion", "mirror", "needle", "octopus", "pencil",
  "quiver", "rocket", "snake", "turtle", "urchin", "vulture", "window", "xenon", "yawn", "zoo",
  "anchor", "book", "candle", "daisy", "earth", "feather", "glove", "hammer", "insect", "jigsaw",
];

const IMPOSTOR_CARD = "You're the impostor!";

const ROOM_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours
const PRESENCE_MS = 10000; // a player counts as "away" after 10s with no heartbeat
const MIN_PLAYERS = 3;     // fewest players needed to start a game

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (request.method === "POST" && pathname === "/api/rooms") {
        const { hostMode } = await request.json().catch(() => ({}));
        const roomId = crypto.randomUUID();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
        return stub.fetch("https://do/init", {
          method: "POST",
          body: JSON.stringify({ roomId, hostMode }),
        });
      }

      const joinMatch = pathname.match(/^\/r\/([0-9a-f-]+)$/);
      if (request.method === "GET" && joinMatch) {
        return html(playerPage());
      }

      const roomMatch = pathname.match(
        /^\/api\/rooms\/([0-9a-f-]+)\/(join|players|start|table|me|remove)(?:\/([0-9a-f-]+))?$/
      );
      if (roomMatch) {
        const [, roomId, action, playerId] = roomMatch;
        const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
        const doUrl = playerId ? `https://do/${action}/${playerId}` : `https://do/${action}`;
        return stub.fetch(doUrl, request);
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      return json({ error: String(err) }, 500);
    }
  },
};

export class ImpostorRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    // Room state is kept hot in memory and loaded from storage only once (on the
    // first request after a cold start). Polling and heartbeats read from memory;
    // storage is written ONLY when something actually changes (join/start/remove).
    this.loaded = false;
    this.meta = null;
    this.players = [];
    // playerId -> last-heartbeat ms. Deliberately in-memory only: presence is
    // ephemeral, so persisting it on every 2s poll would just burn storage ops.
    this.lastSeen = new Map();
  }

  async load() {
    if (this.loaded) return;
    await this.state.blockConcurrencyWhile(async () => {
      if (this.loaded) return;
      this.meta = (await this.state.storage.get("meta")) || null;
      this.players = (await this.state.storage.get("players")) || [];
      this.loaded = true;
    });
  }

  online(playerId) {
    return Date.now() - (this.lastSeen.get(playerId) || 0) < PRESENCE_MS;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const parts = url.pathname.slice(1).split("/");
    const action = parts[0];
    await this.load();

    if (action === "init") {
      const { roomId, hostMode } = await request.json();
      // hostMode: "omniscient" (host sees words + impostors) | "blind" (all hidden)
      const mode = hostMode === "blind" ? "blind" : "omniscient";
      this.meta = { roomId, started: false, hostMode: mode, wordMode: null, everyoneWord: null, impostorWord: null };
      this.players = [];
      this.lastSeen.clear();
      await this.state.storage.put("meta", this.meta);
      await this.state.storage.put("players", this.players);
      await this.state.storage.setAlarm(Date.now() + ROOM_TTL_MS);
      return Response.json({ roomId, hostMode: mode });
    }

    if (action === "join") {
      if (this.meta?.started) return Response.json({ error: "already_started" }, { status: 409 });
      const { name } = await request.json();
      const trimmed = (name || "").trim();
      if (!trimmed) return Response.json({ error: "invalid" }, { status: 400 });
      // Reject a duplicate name (case-insensitive) so one person can't appear twice.
      if (this.players.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
        return Response.json({ error: "name_taken" }, { status: 409 });
      }
      const playerId = crypto.randomUUID();
      this.players.push({ playerId, name: trimmed, word: null, isImpostor: false });
      this.lastSeen.set(playerId, Date.now());
      await this.state.storage.put("players", this.players);
      return Response.json({ ok: true, playerId, count: this.players.length });
    }

    if (action === "players") {
      const roster = this.players.map((p) => ({
        playerId: p.playerId,
        name: p.name,
        online: this.online(p.playerId),
      }));
      return Response.json({
        started: this.meta?.started || false,
        players: roster,
        count: roster.filter((p) => p.online).length, // only present players count
      });
    }

    if (action === "start") {
      if (this.meta?.started) return Response.json({ error: "already_started" }, { status: 409 });

      // Drop anyone who has left (no recent heartbeat) so they aren't dealt a word.
      const present = this.players.filter((p) => this.online(p.playerId));
      if (present.length < MIN_PLAYERS) {
        return Response.json({ error: "min_players", min: MIN_PLAYERS, have: present.length }, { status: 400 });
      }

      const body = await request.json(); // { mode, customWord, impostorWord, everyoneWord, impostorCount }
      const impostorCount = Math.max(1, parseInt(body.impostorCount, 10) || 1);
      // At least one non-impostor is required for a game.
      if (impostorCount >= present.length) {
        return Response.json({ error: "too_many_impostors", max: present.length - 1 }, { status: 400 });
      }

      // Resolve the word(s) for this round.
      let everyoneWord, impostorWord, sameWord;
      const mode = body.mode;
      if (mode === "variation") {
        impostorWord = (body.impostorWord || "").trim();
        everyoneWord = (body.everyoneWord || "").trim();
        if (!impostorWord || !everyoneWord) {
          return Response.json({ error: "missing_words" }, { status: 400 });
        }
        sameWord = false;
      } else if (mode === "custom") {
        everyoneWord = (body.customWord || "").trim();
        if (!everyoneWord) return Response.json({ error: "missing_words" }, { status: 400 });
        impostorWord = IMPOSTOR_CARD;
        sameWord = true;
      } else {
        // "random" (default)
        everyoneWord = randomWord();
        impostorWord = IMPOSTOR_CARD;
        sameWord = true;
      }

      // Pick the impostor(s).
      const idx = present.map((_, i) => i);
      shuffle(idx);
      const impostors = new Set(idx.slice(0, impostorCount));
      present.forEach((p, i) => {
        p.isImpostor = impostors.has(i);
        p.word = p.isImpostor ? impostorWord : everyoneWord;
        // Only told outright in same-word modes; in variation they just get a word.
        p.knowsImpostor = sameWord && p.isImpostor;
      });

      this.players = present;
      this.meta = {
        ...this.meta,
        started: true,
        wordMode: mode,
        everyoneWord,
        impostorWord: sameWord ? null : impostorWord, // no separate word to show in same-word modes
      };
      await this.state.storage.put("players", this.players);
      await this.state.storage.put("meta", this.meta);
      return Response.json({ ok: true, assigned: this.players.length, impostors: impostorCount });
    }

    if (action === "table") {
      const blind = this.meta?.hostMode === "blind";
      return Response.json({
        started: this.meta?.started || false,
        hostMode: this.meta?.hostMode || "omniscient",
        wordMode: this.meta?.wordMode || null,
        everyoneWord: blind ? null : this.meta?.everyoneWord || null,
        impostorWord: blind ? null : this.meta?.impostorWord || null,
        players: this.players.map((p) => ({
          playerId: p.playerId,
          name: p.name,
          isImpostor: blind ? null : !!p.isImpostor, // masked from host in blind mode
          word: blind ? null : p.word,
        })),
      });
    }

    if (action === "remove") {
      // Host manually removes a player from the lobby (e.g. a ghost or a mistake).
      if (this.meta?.started) return Response.json({ error: "already_started" }, { status: 409 });
      const playerId = parts[1];
      this.players = this.players.filter((p) => p.playerId !== playerId);
      this.lastSeen.delete(playerId);
      await this.state.storage.put("players", this.players);
      return Response.json({ ok: true, count: this.players.length });
    }

    if (action === "me") {
      const playerId = parts[1];
      const me = this.players.find((p) => p.playerId === playerId);
      if (!me) return Response.json({ error: "not_found" }, { status: 404 });
      this.lastSeen.set(playerId, Date.now()); // heartbeat — in-memory only, no storage write
      if (!this.meta?.started) return Response.json({ started: false });
      return Response.json({
        started: true,
        name: me.name,
        word: me.word,
        impostor: !!me.knowsImpostor, // true only when the impostor is told outright
      });
    }

    return new Response("DO: not found", { status: 404 });
  }

  // TTL cleanup: wipe everything once the room expires.
  async alarm() {
    await this.state.storage.deleteAll();
    this.meta = null;
    this.players = [];
    this.lastSeen.clear();
    this.loaded = true; // state is now known-empty; no need to re-read storage
  }
}

// ---------- helpers ----------

function randomWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// Slim shell for the player page. Styles/logic live in the static /player.css and
// /player.js assets; the client derives the room id from the URL (/r/:roomId).
function playerPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Impostor</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/player.css">
</head>
<body>
<div class="wrap">
  <h1 class="title">IMP<span class="accent">O</span>STOR</h1>
  <div class="tagline">one of you is lying</div>

  <div id="joinView">
    <input id="name" placeholder="Your name" autocomplete="name">
    <button id="go">Join</button>
    <div class="msg" id="joinMsg"></div>
  </div>

  <div id="lobbyView" class="hidden">
    <div class="msg" id="lobbyMsg">You're in. Waiting for the host to start…</div>
    <details class="howto" open>
      <summary>New to Impostor? How to play</summary>
      <div class="rules"></div>
    </details>
  </div>

  <div id="wordView" class="hidden">
    <div class="reveal-label">Your secret word</div>
    <div class="word-card">
      <p class="word" id="wordText"></p>
      <p class="word-hint" id="wordHint"></p>
    </div>
    <details class="howto">
      <summary>New to Impostor? How to play</summary>
      <div class="rules"></div>
    </details>
  </div>
</div>

<script src="/player.js"></script>
</body>
</html>`;
}
