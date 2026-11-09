# Changelog

## 1.0.0 — 2026-11-08

First stable release. Virtual live-TV channels built from a Jellyfin library,
served as an M3U tuner + XMLTV guide for Jellyfin Live TV or any IPTV player.

### Features
- Virtual channels from library, genre, tag, item-type and title-match filters,
  with Smart QuickCreate (natural-language keywords → filters)
- Deterministic 48-hour schedules (random or sequential), so the guide and the
  stream always agree and restarts never desync
- XMLTV guide with thumbnails; M3U tuner; MPEG-TS stream and HLS endpoints
- Gapless 3-episode concat batches, uniformly re-encoded to H.264 + AAC LC
  stereo so mixed-codec libraries transition cleanly
- Per-channel audio language selection
- Channel management UI with live schedule preview; `/health` with build info
  and stream stats; Docker / Coolify deploy

### Fixed since 0.1.0
- **Episode replayed instead of advancing** when a batch ended early (e.g. the
  next file failed to open at a show boundary). Batches now resume from the
  content actually emitted, the TS pipe is paced to real time (90s tune-in
  burst), and a slot is skipped after 2 failed starts.
- **Video timestamps jumped ~90s backwards at batch handovers**, because PTS
  was re-read from the wall clock while the pipe ran ahead of it. Each
  connection now carries PTS forward from what the previous batch emitted.
- **Tuning in landed minutes behind the guide** when the episode was already
  being transcoded for another tune: Jellyfin reuses transcode jobs that share
  a play session regardless of start time. Every upstream request now sends a
  unique `PlaySessionId`.
- **ffmpeg processes leaked** when a player stopped reading (full buffer) and
  then disconnected; each one stayed blocked forever. Disconnects now close the
  pipe, signal, and SIGKILL as a backstop.
- Runtime dependency advisories (express → body-parser / proxy-addr / qs)
  updated to patched versions.

### Known issues
- Jellyfin **server 12.4 + Jellyfin iOS app 1.8.0**: Live TV playback starts
  and the app drops its connection within a second. The stream itself is fine
  (plays in VLC / IPTV players). Workaround: use an IPTV player directly — see
  README → *Watching without Jellyfin*.
- Jellyfin web on iOS in picture-in-picture / background: iOS suspends the page,
  Jellyfin's kill timer stops the transcode after ~1 minute.
- Mixing 4:3 and 16:9 shows in one channel can stretch the picture (ffmpeg
  scales later files to the first file's size).
- Remaining moderate advisories: `fast-xml-parser` (needs a major upgrade) and
  `qs` as pinned by Express 4.
