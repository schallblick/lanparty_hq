# LAN PARTY HQ

![AI-Generated License Badge](vibe-coded-badge.svg)


A self-hosted dashboard for LAN parties. One person runs the server; everyone
else opens a URL on the local network. Dark neon CRT aesthetic, live-synced
across all devices.

**Zero npm dependencies.** Node 18+ stdlib on the backend; web standards
(EventSource/SSE, fetch, Web Audio API) and vanilla JS on the frontend.
Tailwind is loaded via the Play CDN.

## Features

- **Snack bar** — shared menu with live stock counts. Orders update every
  connected device instantly. Admin mode to edit items and stock.
- **Soundboard** — plays on *every* connected device simultaneously. Ships
  with synthesized sounds (Web Audio, no audio files); upload your own
  mp3/wav/ogg/m4a (8 MB max). Includes a roulette mode that plays a random
  sound on one random device.
- **Leaderboard** — players, points, crown for first place.
- **Steam "now playing"** *(optional)* — live game per player with banner
  art, total / 2-week hours, and drinks consumed per game (orders are tagged
  with whatever was running when placed).
- **World Cup panel** — live scores with match clock and a ticking countdown
  to the next kickoff (ESPN public scoreboard, no key required).
- **TV mode** (`/tv.html`) — auto-rotating fullscreen panels for a big screen.
- **Night recap** (`/recap.html`) — per-person stats, awards, and order-pace
  sparklines.
- **Hydration reminders** — periodic full-screen overlay on all devices.
- **i18n** — English, German, Swiss German. Add a language by extending one
  dictionary in `public/i18n.js`.

## Quick start

```sh
node server.js
```

The console prints the LAN URLs. Open one on any device on the same network.
State persists to `data.json` (created on first run).

On Windows, allow Node through the firewall (private networks) when prompted,
or other devices won't be able to connect.

## Configuration

All configuration is via environment variables. Copy `.env.example` to `.env`,
fill in your values, then:

```sh
node --env-file=.env server.js   # or: npm run start:env
```

| Variable     | Default | Purpose                                      |
| ------------ | ------- | -------------------------------------------- |
| `STEAM_KEY`  | —       | Steam Web API key (enables the Steam panel)  |
| `STEAM_IDS`  | —       | Comma-separated SteamID64 list               |
| `WATER_MINS` | `30`    | Hydration reminder interval (minutes)        |
| `PORT`       | `3000`  | HTTP port                                    |

Steam setup: get a key at <https://steamcommunity.com/dev/apikey>, find each
player's SteamID64 at <https://steamid.io>, and set each profile's
"Game details" privacy to Public.

## Notes

- The soundboard requires one tap on the entry overlay per device (browser
  autoplay policy) before audio can play.
- Internet access is needed for the Tailwind/font CDNs, Steam, and World Cup
  data; everything else runs entirely on your LAN.
- The World Cup panel uses ESPN's unofficial public scoreboard API. It is
  cached server-side and degrades gracefully if the API changes or is
  unreachable.
- This is a trusted-LAN tool: there is no authentication. Don't expose the
  port to the internet.

## License

MIT

## 🤖 AI Transparency

This project this code was ai-generated.

- **AI Model**: Anthropic Claude Fable 5
- **License**: MIT
- **Human Contributor**: schallblick

We believe in transparency about AI usage in software development.
