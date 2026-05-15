# Blog Post Briefing

Paste this into a fresh shell/Claude session to pick up the blog-post drafting task without losing context.

---

**Project:** Jellyfin Virtual TV — sidecar that creates virtual live-TV channels from a Jellyfin library, surfaces them via M3U + XMLTV in Jellyfin's Live TV.

**Repo:** https://github.com/lolimmlost/jellyfin-virtual-tv
**Local path:** `/home/default/Desktop/dev/jellyfin-virtual-tv`
**Branch:** `main` (clean, in sync with origin)
**Deployed:** Coolify on `10.0.0.227:3336`, 28 channels in production, healthy.

**Task:** Draft a blog post about building this app and the interesting challenges. The user hasn't picked length/voice/target yet — ask them these three things before drafting:

1. Length: ~1000w personal post, ~2500w technical war-story, or ~5000w architecture deep-dive?
2. Voice: casual/first-person, or polished technical-blog?
3. Target: file in repo (`docs/blog/`), their own blog, or dev.to / Hashnode / Medium?

**Background — read these first, do NOT re-derive from code:**
- `README.md` — features, install, env vars, troubleshooting, API. Recently swept.
- `CONTEXT.md` — design history, why-not-fork-Tunarr/ErsatzTV decision, Phase 1 status, Streaming Pipeline Evolution section, current ffmpeg incantation with rationale. Recently swept.
- `git log --oneline -20` — commit history including the bug fixes referenced below.

**Strongest material (use as story candidates):**

1. **Silent audio on Android TV** (commit `88cc99d`, fix in `src/server/routes/iptv.ts`). Concat-muxing Jellyfin transcode outputs with `-c:a copy` produced a single mpegts stream with mismatched codec_priv across episodes (AAC stereo + EAC3 5.1 in the same stream). Android TV's audio decoder silently dropped while video kept playing. Fix: re-encode every batch boundary to fixed AAC LC stereo 48k/192k.

2. **Coolify `${VAR:?error}` footgun** (commits `07f99f3` → `c159e6b`). Tightened `docker-compose.yaml` to fail-fast on missing `BASE_URL` using docker-compose's `${BASE_URL:?set in .env...}` syntax. Coolify doesn't honor that syntax — it stored the literal error message as `BASE_URL`'s value. Result: M3U stream URLs became `set in .env to the URL clients use, e.g. http://your-host:3336/iptv/stream/<id>.ts?f=4`. Jellyfin registered zero tuners. Diagnosed by `curl /iptv/channels.m3u | head` and seeing the error message as the URL. Fix: revert the strict syntax, add server-side BASE_URL validation that warns loudly and falls back.

3. **Pure-function schedule engine** (commit `c6c24a3`, `src/server/schedule.ts`). Original schedule engine kept state in memory and regenerated periodically. Result: EPG and stream pointer would disagree after restart, until the next regen cycle. Fix: rewrite as a pure function `(channel, wall-clock time) → slot index` against a fixed anchor (`SCHEDULE_ANCHOR_MS = 2026-01-01 in SCHEDULE_TZ`). Restarts/redeploys can never desync. The cache became a pure optimization — bypassing it produces identical output.

4. **PTS rewinding the player** (commit `88cc99d`, `getPtsOffsetSeconds()`). Each new ffmpeg batch started PTS at 0; players reconnecting mid-stream jumped to t=0. Fix: per-channel base time, `-output_ts_offset = (now - base) mod 12h` (12h wrap stays inside mpegts' 33-bit budget).

5. **EPG empty after deploy** (debugging story from session). Jellyfin's "Refresh Guide" only populates programmes for channels it already knows. "Refresh Channels" (M3U-driven discovery) must run first. Out of order = blank guide. Easy to overlook because both tasks complete with status "Completed".

6. **Editor preview not reacting** (commit `9ddcbf7`). Channel editor's right-side schedule preview was bound to the persisted `channel.id`, fetched the cached server schedule. Toggling filters in the form changed nothing visible. Fix: new `POST /iptv/schedule/preview` that runs `generateSchedule()` against an unsaved channel shape; client debounces 400ms and aborts in-flight on each change.

**Architecture decisions worth a paragraph each (from CONTEXT.md):**
- Path C (Extract & Rebuild) over forking Tunarr or ErsatzTV
- Sidecar pattern (no Jellyfin plugin, just M3U + XMLTV over HTTP)
- Concat-with-re-encode > `-c copy` (story #1 above)
- Pure-function schedule (story #3)
- Two output paths: raw mpegts for Jellyfin's tuner, HLS for direct iOS/Swiftfin

**Current state of files:** `git log --oneline -10` shows the relevant commits with descriptive subjects. Don't grep the full codebase — read CONTEXT.md and README.md first, they're up to date.

**Don't:**
- Re-document things that are already in README/CONTEXT (link to them or quote, don't rewrite).
- Start drafting before getting length/voice/target answers from the user.
- Touch any code; this is a writing task.
