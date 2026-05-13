# Jellyfin Virtual TV — Project Context

> This is the design/context doc — why the project exists, what we evaluated, how it's architected, and how it deploys. For end-user setup and API reference, see [README.md](README.md).

## What This Is
A standalone sidecar app that creates virtual "live TV" channels from your Jellyfin media library. Channels have configurable themes (e.g., Cartoon Network, Anime, Comedy, Dog Channel) and appear in Jellyfin's built-in Live TV guide with a full EPG.

Also serves as a documented, teachable project for React / app-building courses. Every architectural decision is explainable. The build-and-deploy pipeline is part of the curriculum.

**Repo:** github.com/lolimmlost/jellyfin-virtual-tv

**Status (2026-05):** Phase 1 MVP is complete and running in production at `10.0.0.227:3336` with 28 channels feeding a Jellyfin instance at `10.0.0.30:8097`. Streaming pipeline went through several iterations after MVP — see "Streaming Pipeline Evolution" below.

## Why This Exists
- ErsatzTV (closest prior art, C#, ~155K lines) — archived Feb 2026, maintainer burned out from scope creep
- Tunarr (TypeScript, active) — good but always-transcode, multi-platform focus, solo maintainer
- DizqueTV — Plex-only predecessor to Tunarr
- Threadfin/xTeVe — proxies, not schedulers
- **Gap:** No clean, focused, well-documented Jellyfin virtual channel system exists

## Approach: Extract & Rebuild (Path C)
We evaluated three paths:
- **A) Fork Tunarr** — living upstream but diverges from our Jellyfin-only focus within months
- **B) Fork ErsatzTV** — feature-complete but 155K lines of dense C#, frozen, heavy LanguageExt/MediatR patterns
- **C) Extract & Rebuild** — read both codebases, port the *algorithms* (not code) into a clean new project

**Chose Path C because:**
- Clean architecture, only what we need
- Best learning/teaching opportunity (this is also course material)
- No inherited tech debt or dependency treadmill
- The *knowledge* in ErsatzTV/Tunarr (ffmpeg incantations, schedule algorithms, HLS patterns) is more valuable than the code itself
- zlib license on both projects allows studying and porting algorithms freely

## Architecture (Sidecar Pattern)

```
+-------------------+     M3U + XMLTV      +-------------------+
|   Our Sidecar     | ------------------->  |    Jellyfin        |
|   (React + Node)  |                       |    Server          |
|                   | <-------------------  |                    |
|   - Schedule      |   REST API (library)  |   Live TV Guide    |
|   - Config UI     |                       |   shows channels   |
|   - ffmpeg mgr    | --- HLS/TS streams -> |                    |
+-------------------+                       +-------------------+
```

### How It Works
1. Sidecar queries Jellyfin's library via REST API (permanent API key)
2. Builds **48h** rolling schedules per channel from filter rules. The schedule engine is a **pure function of `(channel, wall-clock time)`** against a fixed anchor — restarts and redeploys never desync the schedule, and the EPG and stream pointer always agree.
3. Serves M3U playlist + XMLTV EPG at HTTP endpoints
4. Jellyfin adds these as an IPTV tuner + guide provider
5. When a client tunes in, Jellyfin hits sidecar's stream URL
6. Sidecar builds a **3-episode concat batch** per ffmpeg invocation, capped at the wall-clock end of the last slot. ffmpeg pulls each item from Jellyfin (with `AudioStreamIndex` resolved to the channel's preferred language), **re-encodes to fixed H.264 high@4.1 + AAC LC stereo**, and applies a per-channel `-output_ts_offset` so PTS keeps climbing across batch restarts (reconnects don't rewind the player).
7. Two output paths exist:
   - **`/iptv/stream/:id`** — raw MPEG-TS over chunked HTTP. Per-client ffmpeg. Used by Jellyfin's IPTV tuner (which then re-transcodes for each downstream client).
   - **`/iptv/hls/:id/stream.m3u8`** — HLS playlist + segment files. One ffmpeg per channel, multiple clients can share segments. Used for direct iOS / Swiftfin / web playback.

### Key Integration Points
- **Jellyfin REST API** — `/Items` endpoint for library queries (genres, tags, folders, media types), `/Library/VirtualFolders` for library listing. Auth via permanent API key (`Authorization: MediaBrowser Token="KEY"`)
- **M3U Tuner** — `POST /LiveTv/TunerHosts` with `Type: "m3u"`, pointing at our M3U URL
- **XMLTV Guide** — `POST /LiveTv/ListingProviders` with `Type: "xmltv"`, pointing at our EPG URL
- **HDHomeRun Emulation** — optional, trivial (6 files in ErsatzTV), enables auto-discovery

## Tech Stack
- **Frontend:** React 18 + TypeScript
- **Backend:** Express + TypeScript (Node 22)
- **Database:** SQLite via better-sqlite3 (channels table)
- **Build:** Vite (client) + tsc (server)
- **Dev:** tsx watch (server hot-reload) + Vite dev server (client HMR, port 5173 with `/api` + `/iptv` proxy to 3000)
- **Streaming:** ffmpeg (libx264 veryfast + AAC LC) via concat demuxer, spawned as child processes
- **XML:** Hand-built XMLTV emitter (no fast-xml-parser dep — XMLTV is small and append-only)
- **Deploy:** Docker Compose on Coolify (auto-deploys on push to `main`)

## Project Structure (Current)

```
jellyfin-virtual-tv/
  docker-compose.yaml      # Coolify deployment — single sidecar service
  Dockerfile               # Multi-stage: Node 22 build + ffmpeg runtime; bakes GIT_SHA into version.json
  .dockerignore            # Keeps node_modules/.git out of Docker context
  package.json             # All deps, scripts: dev/build/start
  package-lock.json        # Exact dep versions — required for npm ci
  tsconfig.json            # TS config: ES2022, ESNext modules, strict
  vite.config.ts           # Vite: React plugin, API proxy, builds to dist/client
  index.html               # Vite entry — loads main.tsx
  .env.example             # JELLYFIN_URL, JELLYFIN_API_KEY, BASE_URL, PORT, DB_PATH, SCHEDULE_TZ, CORS_ORIGIN
  .gitignore
  .github/
    ISSUE_TEMPLATE/
      bug_report.yml       # Structured bug report form (asks for /health version)
      feature_request.yml  # Feature request with required acceptance criteria
      config.yml           # Disables blank issues, links to README troubleshooting
  docs/
    lesson-01-zero-to-deployed.md
    lesson-03-channel-crud-sqlite.md
    *.png                  # README screenshots
  src/
    server/
      index.ts             # Express entry, /health + /health/detailed, BASE_URL validation, version.json read
      db.ts                # SQLite schema + migrations (channels table)
      schedule.ts          # 48h pure-function schedule engine, deterministic shuffle, schedule cache
      jellyfin-client.ts   # Jellyfin API queries + getAudioStreamIndex (language→stream index)
      runtime-stats.ts     # Stream/error counters surfaced via /health/detailed
      routes/
        channels.ts        # Channel CRUD + POST /preview (filter result counting)
        iptv.ts            # M3U, XMLTV, MPEG-TS stream, HLS, schedule + schedule preview
        jellyfin.ts        # Status, libraries, genres, tags, items proxy
    client/
      main.tsx             # React bootstrap: createRoot + StrictMode
      App.tsx              # Channel list, editor, QuickCreate, live schedule preview, EPG guide
    shared/
      types.ts             # Channel, ChannelFilter, ScheduleSlot, JellyfinItem
```

## Deployment Setup (E2E)

### Infrastructure
- **Dev machine:** EndeavourOS (Arch-based), local development
- **Deploy server:** 10.0.0.227, running Coolify + existing Jellyfin instance
- **GitHub:** lolimmlost/jellyfin-virtual-tv (public repo)
- **Auth:** SSH key from dev machine to deploy server, gh CLI authed on deploy server

### How Deploys Work
1. Code is written locally or on deploy server
2. Push to `main` on GitHub
3. Coolify detects the push, pulls the repo
4. Runs `docker compose build` using the multi-stage Dockerfile
5. Runs `docker compose up` — container starts on port 3336 (mapped to internal 3000)
6. Coolify checks the `/health` endpoint (curl inside the container)
7. Container marked healthy, traffic routed

### Docker Details
- **Dockerfile Stage 1 (builder):** node:22-slim, npm ci, tsc + vite build
- **Dockerfile Stage 2 (runtime):** node:22-slim + ffmpeg + curl, copies dist/ and node_modules/
- **Compose:** Single service `virtual-tv`, port 3336:3000, env vars for Jellyfin URL/key
- **Health check:** `curl -f http://localhost:3000/health` every 30s, 3 retries

### Gotchas We Hit (Document These for Students)
1. **No package-lock.json** — `npm ci` requires it, `npm install` generates it. Always commit the lockfile.
2. **docker-compose.yml vs .yaml** — Coolify expects `.yaml`. Both are valid YAML, but tools have preferences.
3. **Port 3000 already in use** — another service had it. Changed external port to 3336 (`3336:3000`).
4. **`Cannot GET /`** — Express served API routes but not the React build. Added `express.static()` + `*` catch-all for client-side routing fallback.
5. **Heredoc artifacts in files** — remote file creation via SSH heredocs left trailing `ENDOFFILE'` in config files, breaking the build. Verified by running `npm run build` before pushing.
6. **Coolify doesn't honor `${VAR:?error}`** — docker-compose's strict-mode default syntax (`${BASE_URL:?set in .env}`) is interpreted by Coolify as a literal default value. Result: `BASE_URL` got set to the entire error message string, M3U URLs became garbage, Jellyfin registered zero tuners. Fix: use plain `${VAR}` and validate at server startup with a loud warning.
7. **Silent audio on Android TV** — `-c:a copy` across concat batches passes through whatever per-episode codec_priv Jellyfin produced. Mismatched profiles (AAC stereo + EAC3 5.1) cause some decoders to silently drop audio while video keeps playing. Fix: re-encode audio uniformly to AAC LC stereo at every batch boundary.
8. **EPG silently empty after deploy** — Jellyfin's "Refresh Guide" task only populates programmes for channels it already knows about. Refresh Channels (which discovers them via M3U) must run first. Out of order = blank guide.
9. **PTS resets at every batch** — without `-output_ts_offset`, each new ffmpeg invocation starts PTS at 0, and the player rewinds on every reconnect. Fix: maintain a per-channel base time, derive offset from `(now - base) mod 12h` (12h wrap stays inside mpegts' 33-bit budget).

### Key Dev Patterns
- **Two servers in dev:** Vite (5173, HMR) + Express (3000, API). Vite proxy forwards `/api/*` and `/iptv/*` to Express.
- **One server in prod:** Express serves both the API and the built React static files from `dist/client/`.
- **ESM imports use `.js` extensions** — TypeScript source is `.ts` but compiled output is `.js`. Node resolves the `.js` file at runtime.
- **`0.0.0.0` binding** — required inside Docker so the container accepts external traffic.

## Course Lesson Structure

The course material is paused — the production app outpaced the lesson plan. Lessons 1 and 3 were written before the major streaming-pipeline iteration; lessons 2, 4, 5, 6 were never written. If lessons resume, they need to be rebuilt from the current codebase rather than the original outline.

### Written
- **Lesson 1: Zero to Deployed** — `docs/lesson-01-zero-to-deployed.md`. Project scaffold, every file explained, React basics (state, effects, fetch), Express routing, TypeScript config, Vite proxy, multi-stage Docker, Coolify deployment, real deployment bugs.
- **Lesson 3: Channel CRUD + SQLite** — `docs/lesson-03-channel-crud-sqlite.md`. Database setup, channel creation/editing, filter configuration UI, React forms, data persistence.

### Originally Planned (not written)
Lesson 2 (Jellyfin API), Lesson 4 (Schedule engine), Lesson 5 (M3U + XMLTV), Lesson 6 (FFmpeg). The actual implementation diverged significantly from the original outline — the schedule engine became a pure function of wall-clock time, ffmpeg uses concat-with-re-encode rather than per-file seek, etc.

## Phase 1 Scope (MVP) — COMPLETE

All shipped:
- Docker Compose with sidecar container, deployed via Coolify ✅
- React web config UI for channel CRUD + filter setup ✅
- 28 virtual channels in production (planned: 1-5) ✅
- Filter rules: genre, tag, title match, folder/library, item type, exclude lists ✅
- Shuffle mode: random or sequential ✅
- Schedule engine: 48h rolling, deterministic, pure function of wall-clock time ✅
- ffmpeg pipeline: 3-episode concat batches, re-encode to H.264 + AAC LC, PTS-stable across reconnects ✅
- M3U + XMLTV generation ✅
- Jellyfin Live TV integration with auto-populated channel logos ✅

## Phase 2 (mostly future)

- HDHomeRun emulation for auto-discovery — **not started**
- Channel bumps / filler between shows — **not started**
- Advanced scheduling (time slots, blocks, padding to :00/:30) — **not started** (all current schedules are back-to-back)
- Hardware-accelerated transcoding (NVENC, QSV, VAAPI) — **delegated to Jellyfin** (we ask for `VideoCodec=h264` in the URL params; Jellyfin's GPU pipeline handles HEVC→H.264 before our concat ffmpeg sees the bytes)
- Multi-server support (Plex, Emby) — **not started**
- Watermarks / channel logos overlay — **partially**: channel logos appear in the M3U/EPG so Jellyfin shows them in the guide, but no on-stream overlay
- Per-channel audio language preference — **shipped** (was originally Phase 2-ish; turned out to be a daily-driver requirement once anime channels existed)
- Smart QuickCreate (keyword → filters parser) — **shipped**
- Live schedule preview in the editor — **shipped**

## What to Study from Prior Art

### From ErsatzTV (read, don't fork)
- `ErsatzTV.FFmpeg/` — ffmpeg command construction for different HW backends (~13K lines)
- `HlsSessionWorker` — HLS segment management, idle timeout, crash recovery (870 lines)
- `*/Scheduling/*` — playout engine algorithms, 5 schedule types (~19K lines)
- `HdhrController.cs` — HDHomeRun emulation (37 lines, trivially clean)
- Pipeline builders: how to normalize heterogeneous media into consistent output

### From Tunarr (read, possibly contribute)
- `server/src/ffmpeg/` — simpler ffmpeg management, good reference for MVP
- `server/src/stream/` — session management, concat sessions, stream throttling
- Channel programming transforms: time slots, cyclic shuffle, block shuffle, padding
- `server/src/external/jellyfin/` — Jellyfin API client patterns

## Constraints
- Must run as Docker Compose (Coolify-compatible)
- No custom auth — network isolation handles security
- ffmpeg is required for continuous streams (can't just seek a file)
- Keep it teachable — clean code, good docs, no over-engineering

## Key Technical Details

### Jellyfin REST API (for library queries)
```
GET /Items?userId={uid}&parentId={libraryId}&includeItemTypes=Movie,Episode
        &recursive=true&genres=Action&tags=Holiday
        &fields=Path,MediaSources&sortBy=Random&limit=50
```
- Returns `Path` (filesystem path), `RunTimeTicks` (duration), `MediaSources[]`
- 1 tick = 100 nanoseconds. Divide by 10,000,000 for seconds.
- Auth: `Authorization: MediaBrowser Token="YOUR_API_KEY"` header

### M3U Format (served by our sidecar)
```
#EXTM3U
#EXTINF:0 tvg-id="ch1" tvg-chno="1" tvg-name="Action Movies" tvg-logo="http://..." group-title="Movies", Action Movies
http://sidecar:3000/iptv/stream/ch1
```

### XMLTV Format (served by our sidecar)
```xml
<tv>
  <channel id="ch1">
    <display-name>Action Movies</display-name>
  </channel>
  <programme start="20260331180000 +0000" stop="20260331200000 +0000" channel="ch1">
    <title>Die Hard</title>
    <desc>An NYPD officer...</desc>
  </programme>
</tv>
```

### ffmpeg Stream Command (current)

The MVP plan was per-file ffmpeg with `-ss` seek, but episode boundaries glitched and reconnects rewound the player. The current pipeline uses Jellyfin's transcoding endpoint as the input (so we benefit from Jellyfin's GPU) and a concat playlist of 3 batched episodes capped at the wall-clock end:

```bash
# concat.txt holds 3 lines like:
# file 'http://jellyfin:8096/Videos/<id>/stream.ts?VideoCodec=h264&AudioCodec=aac&AudioStreamIndex=N&...'

ffmpeg -fflags +igndts+genpts+discardcorrupt \
  -f concat -safe 0 -protocol_whitelist file,http,https,tcp,tls \
  -probesize 1048576 -analyzeduration 2000000 \
  -i concat.txt \
  -map 0:v:0 -map 0:a:0 \
  -c:v libx264 -preset veryfast -tune zerolatency \
  -profile:v high -level 4.1 -pix_fmt yuv420p \
  -g 60 -keyint_min 60 -sc_threshold 0 \
  -b:v 6000k -maxrate 8000k -bufsize 12000k \
  -c:a aac -b:a 192k -ar 48000 -ac 2 \
  -t <batchDurationSec> \
  -output_ts_offset <ptsOffsetSec> \
  -f mpegts -mpegts_flags resend_headers -flush_packets 1 \
  pipe:1
```

**Why this shape:**
- **Concat with re-encode** (not `-c copy`) so heterogeneous per-episode codec_priv can't desync audio decoders downstream.
- **`-t batchDuration`** caps ffmpeg at the schedule's wall-clock boundary, so transcoding speed differences can't drift the stream out of sync with the EPG.
- **`-output_ts_offset`** keeps PTS climbing across batch restarts; without it, every reconnect makes the player jump to t=0.
- **`AudioStreamIndex=N`** in each Jellyfin URL is resolved server-side from `MediaSources[0].MediaStreams` to the index whose `Language` matches `channel.audioLanguage` (with eng/en/english aliasing).
- **HLS variant** swaps `-f mpegts ... pipe:1` for `-f hls -hls_time 6 -hls_list_size 0 -hls_flags append_list+omit_endlist+program_date_time` writing to a temp dir; one ffmpeg per channel, multiple HTTP clients can read the same segments.

## Streaming Pipeline Evolution

A short history of why the pipeline ended up where it did, since the commit log alone doesn't explain it:

1. **Per-file ffmpeg with `-ss` seek** (initial MVP) — worked for one episode but had a visible gap and stream-end at every boundary.
2. **Single-process episode chaining** — fixed the gaps but accumulated drift; the stream got further behind the EPG with every transition.
3. **Concat demuxer with `-c copy`** — gapless transitions, no drift, much cheaper. Two failure modes emerged: video stalled at boundaries when SPS/PPS changed, and on Android TV the audio decoder silently dropped when codec_priv changed mid-stream.
4. **Concat demuxer with full re-encode** (current) — fixed both. Cost: one libx264 `veryfast` encoder per active stream. CPU is fine on the deploy box.
5. **Per-channel PTS offset** (current) — added because reconnects were rewinding the player to t=0.
6. **HLS endpoint** (current, parallel) — added for direct iOS/Swiftfin/web playback without going through Jellyfin's tuner indirection.
