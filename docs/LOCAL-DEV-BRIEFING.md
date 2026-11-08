# Local Dev Briefing — Stream Batch Cursor Fix

Paste this into a fresh local Claude session (or read it yourself) to pick up where the cloud session left off.

---

**Project:** Jellyfin Virtual TV — sidecar that turns a Jellyfin library into virtual live-TV channels (M3U + XMLTV for Jellyfin's Live TV).
**Repo:** https://github.com/lolimmlost/jellyfin-virtual-tv
**Branch:** `claude/gallant-lovelace-v10i7m` (pushed; **not merged, no PR yet**)
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

## Still to do / open questions

1. **Verify against real Jellyfin** on the Office + Parks and Rec channel. Watch for one full episode boundary and check the container logs for:
   - `[stream] … batch of 3 — …` lines with a positive `lead`
   - any `[stream] ffmpeg exited …` / `skipping to next slot`

   The ffmpeg stderr in those lines should say **why** Parks and Rec failed to open. That cause hasn't been found yet; the fix only makes the channel recover from it.
2. **Production ffmpeg version.** The Dockerfile uses Debian bookworm's ffmpeg 5.1, but local testing used 6.1. Confirm that `time=` still excludes `-output_ts_offset` there. Symptom if it doesn't: the cursor jumps far ahead and episodes get skipped. Check with `docker exec <container> ffmpeg -version`, and look at the logs for sane `after Ns of Ms` values.
3. **Jellyfin tuner with paced input.** Make sure Jellyfin's tuner doesn't time out or stutter now that the TS pipe runs at real time after the 90 s burst. If it does, try raising `STREAM_MAX_LEAD_MS`.
4. **Not changed: aspect ratio across shows.** ffmpeg auto-scales every later file in a batch to the first file's resolution, so mixing 4:3 and 16:9 shows (or different sizes) can stretch the picture. A possible fix is to add `-vf scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1`. It costs CPU because it upscales SD content.
5. **PR.** Open a PR from `claude/gallant-lovelace-v10i7m` → `main` once item 1 checks out.
