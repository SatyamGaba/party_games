# Unraid deployment

## Runtime

- NAS: fatboy, 192.168.1.75, Unraid 7.1.4.
- LAN URL: http://192.168.1.75:7797.
- Public hostname: https://party.satyamgaba.com, published through the existing fatboy tunnel.
- Container: party-games; image: party-games:fff0909, built on the NAS from committed source.
- Compose file: /mnt/user/appdata/party-games/compose.yaml.
- Source release: /mnt/user/appdata/party-games/releases/fff0909.
- SQLite data: /mnt/user/appdata/party-games/data, owned by container UID/GID 1000.
- Build log: /mnt/user/appdata/party-games/build.log.
- Network: existing proxy-net shared with Unraid-Cloudflared-Tunnel.
- Port mapping: 7797 on the NAS to 3000 in the container.
- Restart policy: unless-stopped; Compose Manager stack autostart is enabled.
- Health endpoint: /health. Docker health checks use the internal port.
- Container logs rotate at 10 MB, keeping three files.

## Compose Manager Plus

Installed stable Compose Manager Plus 2026.10.27 through Unraid's Plugins → Install Plugin page. The installed Docker Compose CLI reports v5.5.0. The maintainer's installer permits Unraid 6.12+; their current documentation reports verification on 7.2.3+, so functionality on this NAS was checked directly.

Official project: https://github.com/mstrhakr/compose_plugin
Unraid listing: https://ca.unraid.net/apps/compose-manager-plus-0wft8je0ra0zhy

Project storage is /mnt/user/appdata/compose. The party-games entry points at the existing compose file under the app's own directory. Stack settings enable health waiting and rebuilding local images on updates. The WebUI shortcut uses the LAN address.

The initial registration error was caused by the configured projects directory not existing yet. Creating that directory allowed registration. No existing containers needed to be stopped.

## Manage and update

Use the Compose section of the Docker page. The Party stack can also be managed from the Unraid terminal:

```sh
docker compose -f /mnt/user/appdata/party-games/compose.yaml ps
docker compose -f /mnt/user/appdata/party-games/compose.yaml logs --tail=100
docker compose -f /mnt/user/appdata/party-games/compose.yaml up -d --build --wait
```

For a new source release, copy the source into a new releases directory, update both the image tag and build context in the compose file, then build and start it. Keep the data bind mount unchanged. Back up this directory using the existing appdata backup process. Active games end on restart; saved results remain.

## Cloudflare

Reuse the existing healthy fatboy tunnel. Route party.satyamgaba.com to http://party-games:3000. The tunnel resolves the container name through proxy-net; port 7797 is for direct LAN use.

Keep the path empty so frontend assets, Colyseus HTTP matchmaking, and WebSockets share the same origin. No router port forwarding, new tunnel token, NAS dashboard route, or changes to existing application routes are required.

Do not store Cloudflare tokens, SSH private keys, or account passwords in this repository.

## Verification

The built container passed its health check on Unraid. Real clients connected from the development computer to the NAS for a two-player-and-TV game: joining, hidden guesses, reveal, and score calculation passed. Shared storage contains completed round data. The public HTTPS site loaded successfully, and creating a room through the public hostname confirmed matchmaking and WebSocket connectivity. Further gameplay testing was stopped at the user’s request.

## Automatic deployment

GitHub Actions checks each push to `main`, builds the application image, and publishes both `latest` and a commit-SHA tag to GitHub Container Registry. The NAS updater pulls `latest` and recreates only the Party container when the image changes. It runs locally and does not require inbound SSH. Updates restart the app, ending active rooms; SQLite data remains in the existing bind mount. If a build fails, the previous image continues running. Use a commit-SHA image tag in the NAS compose file to roll back and pause automatic updates while investigating.

## Fastest Finger First packs

The new game expects external packs; the application image does not contain question files or media. Before enabling it on the NAS, create `/mnt/user/appdata/party-games/packs`, copy the desired packs into it, and add the following to the NAS Compose service while retaining its existing data mount:

```yaml
environment:
  PACKS_DIR: /app/packs
volumes:
  - /mnt/user/appdata/party-games/packs:/app/packs:ro
```

These are additions to the existing service configuration, not a replacement for its environment or volumes. Pack folders must be readable by UID/GID 1000. The host can refresh the pack list and load updated files for a new game without rebuilding the image or restarting the app. Active games retain their loaded data and immutable media copies under the existing data mount. See [the pack guide](../packs/README.md).
