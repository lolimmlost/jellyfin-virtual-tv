#!/usr/bin/env bash
# End-to-end check of /iptv/stream against dev/mock-jellyfin.mjs.
# Usage: dev/e2e-stream.sh [seconds=75]
# Expect: batches advance Office -> Parks -> Office with no replays, and
# roughly (seconds + 90) seconds of video delivered (90s tune-in burst), and
# video PTS that never steps backwards across batch boundaries.
set -u
SECS=${1:-75}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
W=${WORKDIR:-$ROOT/test-media/e2e}; rm -rf "$W"; mkdir -p "$W"
cd "$ROOT"
[ -f "$ROOT/test-media/office.ts" ] || ffmpeg -loglevel error -y -f lavfi -i testsrc=size=640x360:rate=25 -f lavfi -i sine=f=440:r=48000 -t 40 -c:v libx264 -preset ultrafast -c:a aac -ac 2 -f mpegts "$ROOT/test-media/office.ts"
[ -f "$ROOT/test-media/parks.ts" ] || ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=320x240:rate=25 -f lavfi -i sine=f=880:r=48000 -t 40 -c:v libx264 -preset ultrafast -c:a aac -ac 2 -f mpegts "$ROOT/test-media/parks.ts"
node dev/mock-jellyfin.mjs "$ROOT/test-media" > "$W/mock.log" 2>&1 & MOCK=$!
DB_PATH=$W/db.sqlite PORT=3111 JELLYFIN_URL=http://127.0.0.1:8096 JELLYFIN_API_KEY=k BASE_URL=http://127.0.0.1:3111 \
  npx tsx src/server/index.ts > "$W/server.log" 2>&1 & SRV=$!
trap 'kill $SRV $MOCK 2>/dev/null; pkill -f "tsx src/server/index.ts" 2>/dev/null' EXIT
for _ in $(seq 1 40); do curl -sf http://127.0.0.1:3111/health >/dev/null && break; sleep 0.5; done
CH=$(curl -s -XPOST -H 'content-type: application/json' http://127.0.0.1:3111/api/channels \
  -d '{"name":"Comedy","number":5,"filters":{"titleMatch":"the office, parks and recreation"},"shuffleMode":"sequential"}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).channel.id))')
timeout "$SECS" curl -s -o "$W/out.ts" "http://127.0.0.1:3111/iptv/stream/$CH.ts"
echo "== batches =="; grep -E "^\[stream\]|skipping" "$W/server.log" | cut -c1-200
echo "== upstream requests =="; cat "$W/mock.log"
echo "== delivered (25fps test clips) =="
N=$(ffprobe -v error -select_streams v -count_packets -show_entries stream=nb_read_packets -of csv=p=0 "$W/out.ts" | grep -Eo "[0-9]+" | sort -n | tail -1)
echo "$N" | awk '{printf "%.0fs of video in '"$SECS"'s\n",$1/25}'
echo "== video PTS continuity (expect no backward jumps) =="
ffprobe -v error -select_streams v -show_entries packet=pts_time -of csv=p=0 "$W/out.ts" | grep -E "^[0-9]" \
  | awk -F, '{t=$1+0; if (NR>1 && t<p-1) {printf "BACKWARD JUMP at pkt %d: %.2f -> %.2f\n",NR,p,t; b++} if (NR>1 && t>p+2) printf "gap at pkt %d: %.2f -> %.2f\n",NR,p,t; p=t} END {printf "%s (%d packets, last pts %.2f)\n", b?"FAIL":"OK", NR, p}'
