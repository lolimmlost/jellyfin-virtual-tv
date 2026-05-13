# Jellyfin Virtual TV

Virtual live TV channels from your Jellyfin media library. Turn your media collection into a channel-surfing experience with a full EPG guide, M3U tuner support, and automatic scheduling.

![EPG Preview](docs/epg-preview.png)

## Features

- **Virtual Channels** — Create themed channels (Cartoons, Sci-Fi, Action, etc.) from your existing Jellyfin libraries
- **EPG Guide** — Full XMLTV electronic program guide with thumbnails, integrated directly into Jellyfin's Live TV
- **M3U Tuner** — Standard IPTV tuner format, works natively with Jellyfin Live TV
- **Smart Filtering** — Filter content by library, genre, tags, item type (Movies/Episodes), or comma-separated title match
- **Smart QuickCreate** — Type natural-language keywords (`horror comedy no anime movies only`) and the parser auto-builds filters by matching against your Jellyfin genres and tags
- **Live Schedule Preview** — The channel editor shows what your 48-hour schedule will look like as you toggle filters (debounced, animated skeleton during refresh)
- **Genre Picker** — Autocomplete genre selection pulled directly from your Jellyfin library, with custom genre support
- **48-Hour Scheduling** — Deterministic schedules covering all timezones, with random or sequential shuffle modes, regenerated hourly
- **GPU Transcoding** — Offloads HEVC/H264 transcoding to Jellyfin's GPU for seamless mixed-codec playback
- **Audio Language** — Per-channel preferred audio track. The server inspects each item's `MediaSources` and picks the matching track explicitly (English, Japanese, Spanish, French, German, or any ISO 639-2 code), instead of relying on Jellyfin's default selection
- **Uniform Re-encode** — Every concat boundary is re-encoded to fixed H.264 + AAC LC stereo so episode transitions can't desync audio or stall the decoder, even when source files have heterogeneous codecs
- **Stream Modes** — Transcode (H.264+AAC, handles mixed codecs) or Passthrough (original codecs, lower CPU)
- **Channel Management UI** — React-based web interface with now-playing status, live 48h schedule preview, and real-time editing
- **Docker Ready** — Multi-stage Docker build, deploys easily with Coolify or any Docker host

## Screenshots

### Channel Management
Create and manage channels with real-time schedule preview, now-playing status, and content filters.

![Channel Detail](docs/channel-detail.png)
*Channel detail view with now-playing, filters, settings, and 48h schedule*

![Channel Editor](docs/channel-editor.png)
*Edit channel settings with live schedule preview sidebar*

![Genre Picker](docs/genre-picker.png)
*Content filters with genre picker pulled from your Jellyfin library*

### Jellyfin Integration
Channels appear natively in Jellyfin's Live TV with full EPG data, thumbnails, and auto-populated channel logos.

![Jellyfin Channels](docs/channel-list-jellyfin.png)
*All 15 channels with poster art on Jellyfin's Channels page*

![Jellyfin Programs](docs/epg-preview.png)
*"On Now" view in Jellyfin showing what's playing across all channels*

![Jellyfin EPG Guide](docs/epg-guide.png)
*Full EPG grid view in Jellyfin's Live TV guide with channel logos*

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Server | Express.js (Node 22) |
| Frontend | React 18 + Vite |
| Database | SQLite (better-sqlite3) |
| Language | TypeScript (strict) |
| Streaming | FFmpeg (concat demuxer + libx264 + AAC LC) |
| Container | Docker (multi-stage build) |

## Quick Start

### Prerequisites

- A running [Jellyfin](https://jellyfin.org/) server
- A Jellyfin API key (Dashboard > API Keys)
- Docker and Docker Compose (for deployment)

### 1. Clone and configure

```bash
git clone https://github.com/lolimmlost/jellyfin-virtual-tv.git
cd jellyfin-virtual-tv
cp .env.example .env
```

Edit `.env` with your Jellyfin details. The three values you must set:

```env
JELLYFIN_URL=http://your-jellyfin-server:8096
JELLYFIN_API_KEY=your-api-key-here
BASE_URL=http://your-host:3336      # External URL clients will use for streams
```

`BASE_URL` matters more than it looks: it's what gets baked into the M3U playlist as the per-channel stream URL, so it must be reachable from Jellyfin and from any IPTV client devices on your LAN. If you're putting this behind a reverse proxy, set it to the public URL.

### 2. Run with Docker Compose

```bash
docker compose up -d --build --build-arg GIT_SHA=$(git rev-parse --short HEAD)
```

The `GIT_SHA` build arg bakes the commit hash into the image so `/health` can report what's running. The arg is optional; without it `/health` reports `version: "unknown"`.

Verify the deploy:

```bash
curl http://your-host:3336/health
# {"status":"ok","version":"752fc7e","builtAt":"2026-05-12T02:02:22Z"}
```

#### Deploying with Coolify

Configure the application in Coolify, then in **Environment Variables** add:

| Variable | Scope |
|---|---|
| `JELLYFIN_URL` | Runtime |
| `JELLYFIN_API_KEY` | Runtime |
| `BASE_URL` | Runtime |

No build args are needed — Coolify exposes `SOURCE_COMMIT` automatically at runtime and the server reads it for `/health` reporting.

**Important:** if you forget to set `BASE_URL`, the server now logs a loud warning at startup and falls back to per-request URL detection. Older builds silently produced broken M3U URLs (Jellyfin would register zero tuners). Always set `BASE_URL` explicitly to the URL Jellyfin and your IPTV clients use to reach this app.

### 3. Add to Jellyfin

In Jellyfin, go to **Dashboard → Live TV**:

**Add Tuner:**
- Type: M3U Tuner
- URL: `http://your-host:3336/iptv/channels.m3u`
- Save

**Add Guide Provider:**
- Type: XMLTV
- URL: `http://your-host:3336/iptv/epg.xml`
- Save, then enable it for the M3U tuner you just added

**Populate the guide:**

1. **Dashboard → Scheduled Tasks → Refresh Channels** (discovers channels from the M3U)
2. **Dashboard → Scheduled Tasks → Refresh Guide** (pulls programmes for those channels)

Order matters — Refresh Guide before Refresh Channels does nothing because Jellyfin has no channels to attach programmes to. Both tasks run on a schedule afterwards.

### 4. Create channels

Open the web UI at `http://your-host:3336` and create your channels.

**Smart QuickCreate** lets you type natural-language keywords (`horror comedy no anime movies only`) and the parser auto-builds filters by matching against your Jellyfin genres and tags, with a live preview of how many items match.

For full control, use the channel editor. Each channel can be configured with:

**Content Filters:**
- **Libraries** — Pick which Jellyfin libraries to pull from
- **Item Types** — Movies, Episodes, or both
- **Genres** — Select from your Jellyfin library's genres via the genre picker, or type custom genres
- **Tags** — Any Jellyfin tags you've set up
- **Title Match** — Comma-separated series/movie names (e.g., "SpongeBob, Simpsons, Futurama")

The right-hand pane shows a live 48-hour schedule preview that rebuilds (with a shimmering skeleton) every time you change a filter, so you can see what the channel will play before saving.

**Playback Settings:**
- **Shuffle Mode** — Random (different order daily) or Sequential (plays in series order)
- **Stream Mode** — Transcode (normalizes to H.264+AAC for mixed-codec libraries) or Passthrough (original codecs)
- **Audio Language** — Preferred audio track language per channel (e.g., Japanese for anime channels)

After creating channels, run **Refresh Channels** then **Refresh Guide** in Jellyfin to see them in Live TV.

## Development

```bash
npm install
cp .env.example .env  # then edit with your Jellyfin URL + API key
npm run dev
```

This starts both the Express API server (port 3000) and the Vite dev server (port 5173) with hot reload. The Vite dev server proxies `/api` and `/iptv` requests to Express. Open `http://localhost:5173` for the UI.

In dev mode `version.json` isn't generated, so `/health` reports `version: "unknown"` — that's expected.

## API Endpoints

### System

| Endpoint | Description |
|----------|-------------|
| `GET /health` | `{status, version, builtAt}` — used by Docker HEALTHCHECK and bug reports |
| `GET /health/detailed` | Channel counts, schedule cache age, stream stats, Jellyfin reachability |
| `GET /iptv/debug/ffmpeg` | FFmpeg version and codec capabilities (debug) |

### IPTV

| Endpoint | Description |
|----------|-------------|
| `GET /iptv/channels.m3u` | M3U playlist for Jellyfin tuner |
| `GET /iptv/epg.xml` | XMLTV guide for Jellyfin |
| `GET /iptv/stream/:channelId` | Live MPEG-TS stream proxy (used by Jellyfin's IPTV tuner) |
| `GET /iptv/hls/:channelId/stream.m3u8` | HLS playlist for direct iOS/Swiftfin/web playback |
| `GET /iptv/hls/:channelId/:segment` | Individual HLS `.ts` segment |
| `GET /iptv/schedule/:channelId` | Full 48h schedule for a channel |
| `POST /iptv/schedule/preview` | Generate a schedule for an unsaved channel shape (used by the editor's live preview) |
| `GET /iptv/now/:channelId` | What's currently playing |

### Channels

| Endpoint | Description |
|----------|-------------|
| `GET /api/channels` | List all channels |
| `GET /api/channels/:id` | Get a single channel |
| `POST /api/channels` | Create a channel |
| `PUT /api/channels/:id` | Update a channel |
| `DELETE /api/channels/:id` | Delete a channel |
| `POST /api/channels/preview` | Count matching Jellyfin items for a filter (used by QuickCreate) |

### Jellyfin

| Endpoint | Description |
|----------|-------------|
| `GET /api/jellyfin/status` | Connection status |
| `GET /api/jellyfin/libraries` | List libraries |
| `GET /api/jellyfin/genres` | List all genres |
| `GET /api/jellyfin/tags` | List all tags |
| `GET /api/jellyfin/items` | Query items |

## Environment Variables

### Runtime

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JELLYFIN_URL` | Yes | — | Your Jellyfin server URL |
| `JELLYFIN_API_KEY` | Yes | — | Jellyfin API key |
| `BASE_URL` | Yes (production) | Auto-detected from request | External URL clients use to reach this app — gets baked into M3U stream URLs. If malformed (no `scheme://host`), the server logs a warning at startup and ignores it. Auto-detection only works for direct LAN access; behind a reverse proxy it will produce wrong URLs |
| `PORT` | No | `3000` | Server port |
| `DB_PATH` | No | `./data/virtual-tv.db` | SQLite database path. The Docker image volumes `/app/data` so channels persist across redeploys |
| `SCHEDULE_TZ` | No | `America/Los_Angeles` | IANA timezone that controls schedule day boundaries |
| `CORS_ORIGIN` | No | `*` | Comma-separated allowed origins. Restrict in production if exposing the UI publicly |
| `NODE_ENV` | No | — | Set to `production` for static file serving |
| `SOURCE_COMMIT` | No | — | Read at startup as the version reported by `/health`. Coolify sets this automatically |

### Build-time (Docker)

| Variable | Default | Description |
|----------|---------|-------------|
| `GIT_SHA` | `unknown` | Baked into `/app/version.json` and reported by `/health`. Pass via `--build-arg GIT_SHA=$(git rev-parse --short HEAD)`. Coolify users can skip this — `SOURCE_COMMIT` covers it at runtime |

## How It Works

1. **Channels** are configured with content filters (genre, library, title match, etc.) and playback settings (shuffle mode, stream mode, audio language)
2. The **schedule engine** is a pure function of `(channel, wall-clock time)` — it deterministically locates the slot containing "now" against a fixed anchor, so EPG and stream always agree, and restarts/redeploys never desync the schedule
3. The **M3U endpoint** lists channels for Jellyfin's IPTV tuner
4. The **XMLTV endpoint** provides the full programme guide with titles and thumbnails
5. When a client tunes in, the **stream proxy** builds a 3-episode concat batch capped at the wall-clock end of the last slot. ffmpeg pulls each item from Jellyfin (with `AudioStreamIndex` resolved to the channel's preferred language), re-encodes to fixed H.264 high@4.1 + AAC LC stereo, and applies a per-channel `-output_ts_offset` so PTS keeps climbing across batch restarts and reconnects don't rewind the player

### Why re-encode at every batch boundary?

`-c copy` is cheaper, but it passes through whatever codec parameters each Jellyfin transcode produced — episode 1 might be AAC stereo, episode 2 EAC3 5.1. Concat-muxing those with `-c copy` writes one stream with mismatched codec_priv, and many decoders (notably Android TV builds) silently drop audio while video keeps playing. Re-encoding to fixed AAC LC 48 kHz / 192 kbps eliminates that whole class of bug at the cost of one libx264 `veryfast` encoder per active stream.

## Project Structure

```
src/
  server/
    index.ts              # Express entry point + /health endpoints
    db.ts                 # SQLite database (channels table)
    schedule.ts           # 48h schedule engine (pure function of wall-clock time)
    jellyfin-client.ts    # Jellyfin API client (items, MediaSources, audio language resolution)
    runtime-stats.ts      # Stream/error counters surfaced via /health/detailed
    routes/
      iptv.ts             # M3U, XMLTV, MPEG-TS + HLS streaming, schedule preview
      channels.ts         # Channel CRUD + filter preview
      jellyfin.ts         # Status, libraries, genres, tags, items proxy
  client/
    App.tsx               # React UI: channel list, editor, QuickCreate, schedule preview
    main.tsx              # React entry point
  shared/
    types.ts              # Channel, ChannelFilter, ScheduleSlot, JellyfinItem
```

## Troubleshooting

> When in doubt, start with `curl http://your-host:3336/health/detailed`. It tells you in one shot whether channels exist, whether their schedules generated, whether Jellyfin is reachable, and what version is running.

### Empty Live TV / 0 channels in Jellyfin

Symptom: `/iptv/channels.m3u` returns content but Jellyfin's Live TV → Channels list is empty after Refresh Channels.

The most common cause is a misconfigured `BASE_URL`. Check what the M3U actually serves:

```bash
curl http://your-host:3336/iptv/channels.m3u | head
```

If the URL after each `#EXTINF` line doesn't start with `http://your-host:3336/...`, your `BASE_URL` env var isn't a real URL. Builds from `c159e6b` onwards log a `WARNING: BASE_URL is not a valid URL …` line at startup when this happens — check `docker logs <container>` for it. Set `BASE_URL` explicitly in your env (or Coolify's Environment Variables UI) to fix.

### Stale EPG / Guide shows wrong content

Jellyfin caches EPG data aggressively. After updating channels or changing schedule logic, the guide may still show old data even after restarting Jellyfin.

**Method 1: API refresh (try first)**

Trigger both scheduled tasks in order — Refresh Channels first, then Refresh Guide:

```bash
JELLYFIN=http://your-jellyfin:8096
KEY=your-api-key

# Find task IDs
curl -s "$JELLYFIN/ScheduledTasks" -H "Authorization: MediaBrowser Token=\"$KEY\"" \
  | python3 -c "import sys,json; [print(t['Id'], t['Name']) for t in json.load(sys.stdin) if 'channel' in t['Name'].lower() or 'guide' in t['Name'].lower()]"

# Trigger them (substitute the IDs you found above)
curl -X POST "$JELLYFIN/ScheduledTasks/Running/<refresh-channels-id>" -H "Authorization: MediaBrowser Token=\"$KEY\""
# wait for it to complete (poll /ScheduledTasks/<id> until State == Idle)
curl -X POST "$JELLYFIN/ScheduledTasks/Running/<refresh-guide-id>" -H "Authorization: MediaBrowser Token=\"$KEY\""
```

**Method 2: Delete cached EPG files**

If the API refresh isn't enough, clear the cache files directly:

1. Stop Jellyfin
2. Delete the EPG cache files from Jellyfin's config directory:
   ```bash
   rm <jellyfin-config>/cache/*_channels
   rm <jellyfin-config>/cache/xmltv/*.xml
   rm -rf <jellyfin-config>/cache/channels/*
   ```
3. Start Jellyfin
4. Run **Refresh Channels** then **Refresh Guide** from Dashboard → Scheduled Tasks

### EPG and stream showing different content

This happens when Jellyfin's cached EPG is from a previous schedule generation. Both the EPG (`/iptv/epg.xml`) and stream (`/iptv/stream/:id`) use the same schedule engine — if they disagree, the issue is always a stale Jellyfin cache. Clear it using the methods above.

### No content on a channel

- Check that the channel's genre filters match what Jellyfin actually has. Genre names can differ between libraries (e.g., TV shows use "Sci-Fi" while movies use "Science Fiction").
- Use the items endpoint to test: `GET /api/jellyfin/items?genres=YourGenre&libraryId=yourLibId`
- For anime, use "Animation" — Jellyfin has no "Anime" genre.
- Multiple genres use OR logic (matches any), not AND.

### Video freezes at episode boundaries

Set the channel's stream mode to **Transcode** (the default). Passthrough (`copy`) mode requires all files in the channel to have identical codecs, resolution, and audio format. Mixed-codec libraries need transcoding for seamless playback.

### HEVC content fails to play (FFmpeg exit code 234)

Jellyfin caches codec probe results per channel. If you changed the stream pipeline (e.g., enabled GPU transcoding), Jellyfin may still have stale HEVC probe data cached. Signs: probe takes <1ms instead of 3-4 seconds, codec shows "hevc" despite transcoding to H264.

**Fix:** The app includes a cache-busting version parameter (`?f=N`) in M3U stream URLs. If you hit this issue, bump the version in `src/server/routes/iptv.ts`, redeploy, and refresh the M3U tuner in Jellyfin Dashboard > Live TV.

### Wrong audio language

Each channel has an **Audio Language** setting (default: English). For anime channels, set this to Japanese (`jpn`). The setting uses ISO 639-2 language codes; common aliases (`en`/`eng`/`english`, `ja`/`jpn`/`japanese`, `es`/`spa`/`spanish`, `fr`/`fre`/`fra`/`french`, `de`/`ger`/`deu`/`german`) are all accepted.

The server resolves the matching `AudioStreamIndex` per item by inspecting Jellyfin's `MediaSources[0].MediaStreams`. If a file has no audio track tagged with the requested language, the server falls through to Jellyfin's default selection and logs:

```
[stream] <ChannelName>: no '<lang>' audio track on <Title> — using Jellyfin default
```

If you see that line for files you expect to be in English, the source file isn't language-tagged — fix the metadata in Jellyfin (or run `mediainfo` to confirm) and the next batch will pick it up.

### Silent audio on Android TV (or other Jellyfin clients) but video plays fine

This was a real bug fixed in commit `88cc99d`. Symptom: the new Android TV Jellyfin client renders video but the audio decoder silently drops. Root cause: passing through Jellyfin's per-episode audio with `-c copy` and concat-muxing produced a single stream with mismatched codec_priv across episodes, which some decoders refuse to play.

The fix re-encodes audio uniformly to AAC LC stereo at every batch boundary. If you still see this on a self-built or older deploy, make sure you're on a build that includes `88cc99d` or later and that the channel's stream mode is **Transcode** (not **Passthrough**).

## License

MIT
