# Local Dev Briefing — Stream Batch Cursor Fix

Paste this into a fresh local Claude session (or read it yourself) to pick up where the cloud session left off.

---

**Project:** Jellyfin Virtual TV — sidecar that turns a Jellyfin library into virtual live-TV channels (M3U + XMLTV for Jellyfin's Live TV).
**Repo:** https://github.com/lolimmlost/jellyfin-virtual-tv
**Branch:** `claude/gallant-lovelace-v10i7m` → PR to `main` for v1.0.0
**Local path:** `/home/default/Desktop/dev/jellyfin-virtual-tv`

```bash
git fetch origin claude/gallant-lovelace-v10i7m
git checkout claude/gallant-lovelace-v10i7m
npm ci
```

**Background — read these first, don't re-derive from code:**
- `CONTEXT.md` — architecture, ffmpeg pipeline rationale, "Gotchas" list (item 10 is this bug).
- `README.md` → *Development* and *How It Works*.
- `git show b3fd382` — the fix commit with a full explanation.

## The bug

Channel with `shuffleMode: random`, `titleMatch: "the office, parks and recreation"`. At the end of an Office episode the stream **replayed The Office instead of moving on to Parks and Rec**. Backing out and re-tuning played the correct Parks and Rec episode, and the guide was right all along.

**Root cause** (`src/server/routes/iptv.ts`):
1. ffmpeg pulls from Jellyfin about **5× faster than real time**, and the TS pipe had no pacing or backpressure.
2. After each 3-episode concat batch, the loop chose the next batch from **wall-clock "now"**.
3. When a batch ended early, the clock was still inside the previous slot, so that slot was replayed. The most visible way a batch ends early is the next file failing to open at a show boundary, and **ffmpeg can exit 0 in that case**. Even with no failure, the old code re-sent the same episode many times over (confirmed: about 500 s of mostly repeated video pushed in 60 s).
4. Re-tuning worked because by then the clock was inside Parks and Rec's slot.

## What changed (commit `b3fd382`)

All in `src/server/routes/iptv.ts`, shared by the `/iptv/stream/:id` (TS) and `/iptv/hls/:id` loops:

- **Content cursor.** `createProgressParser()` reads ffmpeg's `time=` stats, which exclude `-output_ts_offset` (verified on ffmpeg 6.1). `advanceCursor()` sets the cursor to `batchStart + emitted`, and `planBatch()` starts the next batch at `max(cursor, now)`.
- **Pacing (TS only).** ffmpeg's stdout is paused when output is more than `STREAM_MAX_LEAD_MS` (90 s) ahead of the clock, or when the client socket is backed up (`res.write` returns false → wait for `drain`).
- **Failure handling.** A batch that emits less than 1 s counts as a failed start. After 2 failed starts in a row, the channel skips to the next slot. There's also a 2 s back-off after any non-zero exit.
- **`-t` cap** is now the batch's scheduled content length, not "end time minus now".
- **HLS loop** waits until the cursor time instead of the batch end, so a failed boundary resumes sooner instead of skipping the rest of the batch.
- **Logs** now include `after Ns of Ms`, `lead Ns`, and `skipping to next slot`.

## Testing locally without Jellyfin

`dev/mock-jellyfin.mjs` is a fake Jellyfin on :8096 that serves three 40 s episodes (Office / Parks / Office). The first request for the Parks stream returns 500; set `FAIL_B1=0` to disable that. `dev/e2e-stream.sh` generates test clips into `test-media/` (gitignored), starts the mock and the server on :3111, creates the channel, and records the stream:

```bash
dev/e2e-stream.sh 75     # needs ffmpeg, ffprobe, curl on PATH
```

**What to expect:**
- Batches advance through the schedule and **never repeat the episode just shown** (e.g. `b1 failing` → next batch starts at `b1`, not `a1`).
- Delivered video ≈ `seconds + 90`, minus startup time.

To compare against the old behavior: `git stash` / `git checkout 863e331 -- src/server/routes/iptv.ts`, re-run the script, then restore.

Regular dev loop: `cp .env.example .env`, point `JELLYFIN_URL` / `JELLYFIN_API_KEY` at your real server, run `npm run dev`, and open http://localhost:5173. Type-check with `npx tsc --noEmit -p .`. There's no unit-test suite.

## Status (2026-11-08, v1.0.0)

Verified on production (Jellyfin 12.4, image ffmpeg 5.1) on the Office + Parks and Rec channel:

1. **Batch cursor fix** — every tune and in-batch episode switch matched the EPG to the second; batches advance, no replays.
2. **Production ffmpeg 5.1** — `time=` still excludes `-output_ts_offset` (cursor values and `after Ns of Ms` were sane).
3. **Jellyfin tuner with paced input** — no timeouts. The real problems were elsewhere, all fixed for 1.0:
   - PTS stepped back ~90s at batch handovers (wall-clock PTS vs. a pipe running ahead) → per-connection PTS carry-forward. Verified live: handover at +6904s on the same VLC connection, ≈ previous start + cap + 1s.
   - Repeat tunes of an episode reused Jellyfin's existing transcode from its old start → unique `PlaySessionId` per upstream request. Verified: each tune gets its own `-ss` transcode.
   - ffmpeg leaked after a stalled client disconnected → `stopFfmpeg()`. `dev/e2e-stream.sh` now checks this (FAIL on 3f4c424, OK after).
   - Jellyfin **Allow stream sharing** replayed one buffered copy per tune → turn it off (README).

`dev/e2e-stream.sh` now also reports PTS continuity and leftover ffmpegs; all three checks should print `OK`.

## Still open

1. **Aspect ratio across shows** (unchanged): ffmpeg scales later files in a batch to the first file's size, so mixing 4:3 and 16:9 can stretch. Possible fix: `-vf scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1` (costs CPU upscaling SD).
2. **Jellyfin iOS app 1.8.0 + server 12.4** won't hold a Live TV stream (client side; stream plays in VLC). Jellyfin web on iOS stops in PiP/background (page suspended → transcode kill timer). Workaround: IPTV player directly.
3. **Why Parks and Rec failed to open** in the original report was never pinned down; the channel now recovers from it either way.
4. **Moderate advisories**: `fast-xml-parser` (major upgrade) and `qs` via Express 4.
