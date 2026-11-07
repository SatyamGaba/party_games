# Party

A self-hosted party-game platform for phones and shared displays. React + Base UI, Colyseus, TypeScript, SQLite, and a Curl-inspired theme with self-hosted Inter.

## Local development

Use Node.js 26 LTS (`nvm use`), then:

```sh
npm ci
npm run dev
```

In a second terminal, run `npm run dev:web`. Open http://localhost:5173. Create a room, join from other phones/tabs, and use **Open shared screen** for the TV. Phones on your LAN use your development machine's IP with port 5173.

Production preview: `npm run build && npm start`, then open http://localhost:3000.

`npm run check` runs Vitest integration/unit tests, type checking, and both builds. Tests use real Colyseus clients and a temporary SQLite database. Test-only room subclasses shorten timers and inject a deterministic roll.

## Unraid deployment

Install Docker Compose support on Unraid or use its Compose Manager plugin. Copy the project to a persistent share, then run:

```sh
docker compose up -d --build
docker compose logs -f party-games
```

Visit http://NAS-IP:3000. Set `PARTY_PORT` to change the host port. The named `party-data` volume holds SQLite data; back it up using your existing Unraid backup process. For an appdata bind mount, replace the volume with `/mnt/user/appdata/party-games:/app/data` and give the directory ownership to container UID/GID 1000. One process/container is intentional; do not scale replicas without revisiting Colyseus presence, matchmaking, and room-code allocation.

The image uses Node.js 26 LTS, compiles the server to JavaScript, runs as a non-root user, and exposes a health check at `/health`. Compose restarts the application and forwards termination signals through `init: true`. SIGTERM closes active rooms and the database. Active games end on server restart; completed results remain in SQLite.

## party.satyamgaba.com

Point DNS at your chosen public ingress. Configure your existing reverse proxy to terminate HTTPS and forward **all paths**, including Colyseus HTTP matchmaking and WebSocket upgrades, to NAS-IP:3000. Keep the frontend and backend on the same origin. If using a tunnel, it must support WebSockets. No DNS, router, or NAS configuration is changed by this repository.

Example for an existing Caddy reverse proxy:

```caddy
party.satyamgaba.com {
    reverse_proxy NAS-IP:3000
}
```

Caddy handles HTTPS and WebSocket upgrades. Only publish the proxy endpoint; the NAS management interface is unrelated to this app. The app's matchmaking rate limit uses the direct peer address, so behind a proxy its 120 requests/minute budget is shared; tune it if your usage grows. Do not trust forwarded IP headers without configuring a trusted proxy boundary.

## Game behavior

Roll the Dice supports 1–24 players and separate display clients. The host plays and starts each round. Players lock one guess from 1–6; guesses are private until reveal. Once all eligible players answer, a cryptographic server roll is animated for 2.8 seconds, then exact matches receive 10 points each.

Late arrivals play next round. Dropped connections have 30 seconds to return; unanswered guesses are skipped after expiry. Accepted answers remain eligible. When the host leaves permanently, control goes to the earliest connected player. Rooms disappear when no clients or reconnection reservations remain. Reconnection tokens are stored per tab, refreshed after reconnecting, and never logged.

## Adding games

Each directory under `src/games/` owns its Colyseus room, schemas, validation, rules, screens, and content. Register the room in the server registry and the manifest/screen in the client registry. The application renders cards from the registry.

Extend the small `PartyRoom` base for participant lifecycle and authorization helpers. Use `registerMessage` with a Zod schema for validated acknowledgements, and `SubmissionLedger` for answer retry protection. Games own their phase transitions, clocks, role permissions, scoring, and any messaging. Shared transport does not inspect a game ID or understand rounds.

Public synchronized fields are visible to every connected client. Mark private schema fields with Colyseus views and explicitly grant the appropriate instances to authorized clients. Unrevealed random results remain outside synchronized state. A shared display receives public data and cannot invoke player/host actions.

Use shared UI wrappers and semantic theme/typography tokens. Inter is served locally; no Google Fonts request is needed. Light/dark/system appearance is remembered per browser. New moderator roles and messaging must be implemented inside the relevant game with server-side authorization.

## Dependencies

Direct dependencies are pinned to registry `latest` stable releases resolved during implementation; the lockfile records transitive versions. Use `npm ci`. Review updates and peer compatibility together, especially Colyseus core/SDK/schema/transport. Never install prereleases automatically.
