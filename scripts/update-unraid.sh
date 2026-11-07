#!/bin/sh
# Run on the NAS; only recreate Party when a new image is available.
set -eu
image=ghcr.io/satyamgaba/party_games:latest
compose=/mnt/user/appdata/party-games/compose.yaml
lock=/var/lock/party-games-update.lock
exec 9>"$lock"
flock -n 9 || exit 0
old=$(docker inspect --format '{{.Image}}' party-games 2>/dev/null || true)
docker pull "$image"
new=$(docker image inspect --format '{{.Id}}' "$image")
if [ "$old" != "$new" ]; then
  docker compose -f "$compose" up -d --no-build --wait --wait-timeout 120 party-games
fi
