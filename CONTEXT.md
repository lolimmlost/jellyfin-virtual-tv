# Jellyfin Virtual TV — Project Context

## What This Is
A standalone sidecar app that creates virtual "live TV" channels from your Jellyfin media library. Channels have configurable themes (e.g., Cartoon Network, Anime, Comedy, Dog Channel) and appear in Jellyfin's built-in Live TV guide with a full EPG.

Also serves as a documented, teachable project for React / app-building courses. Every architectural decision is explainable. The build-and-deploy pipeline is part of the curriculum.

**Repo:** github.com/lolimmlost/jellyfin-virtual-tv

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
2. Builds 24h rolling schedules per channel based on filter rules
3. Serves M3U playlist + XMLTV EPG at HTTP endpoints
4. Jellyfin adds these as an IPTV tuner + guide provider
5. When user tunes in, Jellyfin hits sidecar's stream URL
6. Sidecar spawns ffmpeg, reads media file at correct schedule offset, streams MPEG-TS/HLS back
7. Multiple viewers on same channel share one ffmpeg process (HLS segments)

### Key Integration Points
- **Jellyfin REST API** — `/Items` endpoint for library queries (genres, tags, folders, media types), `/Library/VirtualFolders` for library listing. Auth via permanent API key (`Authorization: MediaBrowser Token="KEY"`)
- **M3U Tuner** — `POST /LiveTv/TunerHosts` with `Type: "m3u"`, pointing at our M3U URL
- **XMLTV Guide** — `POST /LiveTv/ListingProviders` with `Type: "xmltv"`, pointing at our EPG URL
- **HDHomeRun Emulation** — optional, trivial (6 files in ErsatzTV), enables auto-discovery

## Tech Stack
- **Frontend:** React 18 + TypeScript
- **Backend:** Express + TypeScript (Node 22)
- **Database:** SQLite via better-sqlite3
- **Build:** Vite (client) + tsc (server)
- **Dev:** tsx watch (server hot-reload) + Vite dev server (client HMR)
- **Streaming:** ffmpeg (spawned as child processes)
- **XML:** fast-xml-parser (for XMLTV generation)
- **Deploy:** Docker Compose on Coolify

## Project Structure (Current)

```
jellyfin-virtual-tv/
  docker-compose.yaml      # Coolify deployment — single sidecar service
  Dockerfile               # Multi-stage: Node 22 build + ffmpeg runtime
  .dockerignore             # Keeps node_modules/.git out of Docker context
  package.json             # All deps, scripts: dev/build/start
  package-lock.json        # Exact dep versions — required for npm ci
  tsconfig.json            # TS config: ES2022, ESNext modules, strict
  vite.config.ts           # Vite: React plugin, API proxy, builds to dist/client
  index.html               # Vite entry — loads main.tsx
  .env.example             # JELLYFIN_URL, JELLYFIN_API_KEY, PORT
  .gitignore
  docs/
    lesson-01-zero-to-deployed.md
  src/
    server/
      index.ts             # Express app: health, API routes, static serving
      routes/
        channels.ts        # Channel CRUD (stub)
        iptv.ts            # M3U, XMLTV, stream endpoints (stub)
        jellyfin.ts        # Jellyfin API proxy (stub)
    client/
      main.tsx             # React bootstrap: createRoot + StrictMode
      App.tsx              # Root component: fetches channels, shows list
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

### Key Dev Patterns
- **Two servers in dev:** Vite (5173, HMR) + Express (3000, API). Vite proxy forwards `/api/*` and `/iptv/*` to Express.
- **One server in prod:** Express serves both the API and the built React static files from `dist/client/`.
- **ESM imports use `.js` extensions** — TypeScript source is `.ts` but compiled output is `.js`. Node resolves the `.js` file at runtime.
- **`0.0.0.0` binding** — required inside Docker so the container accepts external traffic.

## Course Lesson Structure

### Lesson 1: Zero to Deployed (COMPLETE)
**File:** `docs/lesson-01-zero-to-deployed.md`
**Covers:** Project scaffold, every file explained, React basics (state, effects, fetch), Express routing, TypeScript config, Vite proxy, multi-stage Docker, Coolify deployment, real deployment bugs
**Exercises:** Add status endpoint, show it in React, shared types, break the health check

### Lesson 2: Connecting to Jellyfin (NEXT)
**Covers:** Jellyfin REST API, API keys, querying libraries and items, filtering by genre/tags, displaying media in React, environment variables in practice

### Lesson 3: Channel CRUD + SQLite
**Covers:** Database setup, channel creation/editing, filter configuration UI, React forms, data persistence

### Lesson 4: Schedule Engine
**Covers:** Building 24h rolling schedules from filtered media, time arithmetic, deterministic shuffle, schedule state management

### Lesson 5: M3U + XMLTV Generation
**Covers:** IPTV standards, generating M3U playlists, XMLTV EPG format, registering with Jellyfin as a tuner

### Lesson 6: FFmpeg Streaming
**Covers:** Spawning ffmpeg processes, seek offset calculation, HLS segment generation, process lifecycle, crash recovery

## Phase 1 Scope (MVP)
- Docker Compose with sidecar container (Jellyfin is pre-existing)
- Web config UI (React) for channel CRUD + filter setup
- 1-5 virtual channels, each with:
  - Name (e.g., "Cartoon Network")
  - Filter rules: genre, tag, title match, folder/library
  - Shuffle mode: random or sequential
- Schedule engine: 24h rolling schedule, fills timeline from filtered media
- ffmpeg pipeline: reads source file at offset, outputs HLS segments
- M3U + XMLTV generation served at HTTP endpoints
- Jellyfin sees channels in Live TV guide, users tune in and watch

## Phase 2 (Future, Not Now)
- HDHomeRun emulation for auto-discovery
- Channel bumps / filler between shows
- Advanced scheduling (time slots, blocks, padding to :00/:30)
- Hardware-accelerated transcoding (NVENC, QSV, VAAPI)
- Multi-server support (Plex, Emby)
- Watermarks / channel logos overlay

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

### ffmpeg Stream Command (conceptual)
```bash
ffmpeg -ss <offset> -i /media/movies/movie.mkv \
  -c:v libx264 -c:a aac -f mpegts \
  -hls_time 6 -hls_list_size 10 \
  pipe:1
```
