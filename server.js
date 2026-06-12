// LAN PARTY HQ — zero-dependency Node server (Node 18+)
// Run: node server.js   → http://<your-lan-ip>:3000
// Steam (optional): set STEAM_KEY and STEAM_IDS (comma-separated 64-bit IDs)
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, "data.json");
const SOUND_DIR = path.join(ROOT, "sounds");
const STEAM_KEY = process.env.STEAM_KEY || "";
const STEAM_IDS = (process.env.STEAM_IDS || "").split(",").map(s => s.trim()).filter(Boolean);

fs.mkdirSync(SOUND_DIR, { recursive: true });

// ---------- state ----------
let state = {
  items: [
    { id: "i1", emoji: "🍕", name: "Pizza Slice", stock: 8 },
    { id: "i2", emoji: "🥤", name: "Energy Drink", stock: 12 },
    { id: "i3", emoji: "🍺", name: "Beer", stock: 18 },
    { id: "i4", emoji: "🌮", name: "Nachos", stock: 6 },
    { id: "i5", emoji: "🍫", name: "Chocolate", stock: 10 },
  ],
  orders: [],            // {who,item,emoji,game,ts}
  players: [],           // {name,score}
  sounds: [],            // uploaded: {id,name,file}
  gameDrinks: {},        // {gameName: count}
};
try { state = { ...state, ...JSON.parse(fs.readFileSync(DATA, "utf8")) }; } catch {}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(DATA, JSON.stringify(state, null, 1), () => {}), 300);
}

// ---------- SSE ----------
const clients = new Map(); // res -> {name}
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients.keys()) res.write(msg);
}
function sendTo(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
const sync = () => broadcast("state", state);

// ---------- steam ----------
let steamCache = { ts: 0, data: null };
async function steam() {
  if (!STEAM_KEY || !STEAM_IDS.length) return { configured: false };
  if (Date.now() - steamCache.ts < 60000 && steamCache.data) return steamCache.data;
  try {
    const sum = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_KEY}&steamids=${STEAM_IDS.join(",")}`
    ).then(r => r.json());
    const players = [];
    for (const p of sum.response?.players || []) {
      let recent = [];
      try {
        const r = await fetch(
          `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${STEAM_KEY}&steamid=${p.steamid}&count=3`
        ).then(r => r.json());
        recent = (r.response?.games || []).map(g => ({
          name: g.name, appid: g.appid,
          hoursTotal: Math.round(g.playtime_forever / 6) / 10,
          hours2w: Math.round((g.playtime_2weeks || 0) / 6) / 10,
        }));
      } catch {}
      players.push({
        name: p.personaname, avatar: p.avatarfull,
        playing: p.gameextrainfo || null, appid: p.gameid || null,
        banner: p.gameid ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${p.gameid}/header.jpg` : null,
        recent,
      });
    }
    steamCache = { ts: Date.now(), data: { configured: true, players } };
    return steamCache.data;
  } catch (e) {
    return { configured: true, error: String(e), players: [] };
  }
}
function currentGame() {
  const d = steamCache.data;
  return d?.players?.find(p => p.playing)?.playing || null;
}

// ---------- world cup (ESPN public scoreboard, unofficial) ----------
let wcCache = { ts: 0, data: null };
async function worldcup() {
  if (Date.now() - wcCache.ts < 60000 && wcCache.data) return wcCache.data;
  const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, "");
  const from = fmt(new Date(Date.now() - 864e5)), to = fmt(new Date(Date.now() + 6 * 864e5));
  try {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${from}-${to}&limit=200`).then(x => x.json());
    const games = (r.events || []).map(e => {
      const c = e.competitions?.[0] || {};
      const side = ha => {
        const x = (c.competitors || []).find(t => t.homeAway === ha) || {};
        return { name: x.team?.shortDisplayName || "?", flag: x.team?.logo || "", score: x.score ?? "" };
      };
      return {
        date: e.date, state: c.status?.type?.state || "pre",
        clock: c.status?.displayClock || "", detail: c.status?.type?.shortDetail || "",
        home: side("home"), away: side("away"), venue: c.venue?.fullName || "",
      };
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
    wcCache = { ts: Date.now(), data: { games } };
    return wcCache.data;
  } catch (e) {
    return wcCache.data || { games: [], error: String(e) };
  }
}

// ---------- helpers ----------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".m4a": "audio/mp4",
  ".png": "image/png", ".svg": "image/svg+xml" };
function send(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}
function body(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", c => { size += c.length; if (size > limit) { req.destroy(); reject(new Error("too big")); } chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ---------- server ----------
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;

  // SSE
  if (p === "/api/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
    clients.set(res, { name: url.searchParams.get("name") || "anon" });
    req.on("close", () => clients.delete(res));
    return;
  }

  try {
    if (p === "/api/state") return send(res, 200, state);

    if (p === "/api/steam") return send(res, 200, await steam());

    if (p === "/api/worldcup") return send(res, 200, await worldcup());

    if (p === "/api/order" && req.method === "POST") {
      const { who, itemId } = JSON.parse(await body(req));
      const item = state.items.find(i => i.id === itemId);
      if (!item) return send(res, 404, { error: "no such item" });
      if (item.stock <= 0) return send(res, 409, { error: "out of stock" });
      item.stock--;
      const game = currentGame();
      state.orders.unshift({ who, item: item.name, emoji: item.emoji, game, ts: Date.now() });
      if (game) state.gameDrinks[game] = (state.gameDrinks[game] || 0) + 1;
      save(); sync();
      return send(res, 200, { ok: true });
    }

    if (p === "/api/items" && req.method === "POST") { // add or update
      const it = JSON.parse(await body(req));
      const ex = state.items.find(i => i.id === it.id);
      if (ex) Object.assign(ex, it);
      else state.items.push({ id: "i" + crypto.randomUUID().slice(0, 8), emoji: it.emoji || "🍴", name: it.name, stock: it.stock | 0 });
      save(); sync();
      return send(res, 200, { ok: true });
    }
    if (p === "/api/items" && req.method === "DELETE") {
      state.items = state.items.filter(i => i.id !== url.searchParams.get("id"));
      save(); sync();
      return send(res, 200, { ok: true });
    }

    if (p === "/api/players" && req.method === "POST") {
      const { name } = JSON.parse(await body(req));
      if (name && !state.players.find(x => x.name === name)) state.players.push({ name, score: 0 });
      save(); sync();
      return send(res, 200, { ok: true });
    }
    if (p === "/api/score" && req.method === "POST") {
      const { name, delta } = JSON.parse(await body(req));
      const pl = state.players.find(x => x.name === name);
      if (pl) pl.score += delta | 0;
      save(); sync();
      return send(res, 200, { ok: true });
    }

    if (p === "/api/sounds" && req.method === "POST") { // raw body upload
      const name = (url.searchParams.get("name") || "sound").replace(/[^\w.\- ]/g, "");
      const ext = path.extname(name).toLowerCase();
      if (![".mp3", ".wav", ".ogg", ".m4a"].includes(ext)) return send(res, 400, { error: "mp3/wav/ogg/m4a only" });
      const buf = await body(req);
      const id = "s" + crypto.randomUUID().slice(0, 8);
      const file = id + ext;
      fs.writeFileSync(path.join(SOUND_DIR, file), buf);
      state.sounds.push({ id, name: name.replace(ext, ""), file });
      save(); sync();
      return send(res, 200, { ok: true });
    }

    if (p === "/api/play" && req.method === "POST") { // troll broadcast
      const { sound, who } = JSON.parse(await body(req));
      broadcast("play", { sound, who });
      return send(res, 200, { ok: true });
    }

    if (p === "/api/roulette" && req.method === "POST") {
      const { who, pool } = JSON.parse(await body(req));
      if (!clients.size || !pool?.length) return send(res, 409, { error: "no targets" });
      const entries = [...clients.entries()];
      const [victimRes, victim] = entries[Math.floor(Math.random() * entries.length)];
      const sound = pool[Math.floor(Math.random() * pool.length)];
      sendTo(victimRes, "play", { sound, who });
      broadcast("roulette", { who, victim: victim.name });
      return send(res, 200, { ok: true, victim: victim.name });
    }

    if (p === "/api/hydrate" && req.method === "POST") { // manual trigger / test
      broadcast("hydrate", {});
      return send(res, 200, { ok: true });
    }

    // uploaded sounds
    if (p.startsWith("/sounds/")) {
      const f = path.join(SOUND_DIR, path.basename(p));
      if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
      return fs.createReadStream(f).pipe(res);
    }

    // static
    let f = path.join(ROOT, "public", p === "/" ? "index.html" : path.normalize(p).replace(/^([.][.][\\/])+/, ""));
    if (!f.startsWith(path.join(ROOT, "public"))) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end("404"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "text/plain" });
    fs.createReadStream(f).pipe(res);
  } catch (e) {
    send(res, 500, { error: String(e) });
  }
}).listen(PORT, () => {
  const WATER_MIN = +process.env.WATER_MINS || 30;
  setInterval(() => broadcast("hydrate", {}), WATER_MIN * 60 * 1000);
  const nets = require("os").networkInterfaces();
  const ips = Object.values(nets).flat().filter(n => n.family === "IPv4" && !n.internal).map(n => n.address);
  console.log(`\n  LAN PARTY HQ running:\n  → http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`  → http://${ip}:${PORT}   (share this URL on your LAN)`));
  if (!STEAM_KEY) console.log("\n  Steam integration disabled. See README / .env.example to enable.");
});
