import { useState, useEffect } from "react";
import { c } from "../theme";
import { formatTime } from "../format";
import { getNowPlaying, type NowPlayingData } from "../api";

export function NowPlaying({ channelId }: { channelId: string }) {
  const [nowData, setNowData] = useState<NowPlayingData | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let endTimer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      try {
        const d = await getNowPlaying(channelId);
        if (cancelled) return;
        setNowData(d);
        // Refetch right after the current slot ends so we roll over to the next program
        if (endTimer) clearTimeout(endTimer);
        if (d?.endTime) {
          const remaining = new Date(d.endTime).getTime() - Date.now();
          if (remaining > 0 && remaining < 60 * 60 * 1000) {
            endTimer = setTimeout(load, remaining + 800);
          }
        }
      } catch {
        if (!cancelled) setNowData(null);
      }
    };

    load();
    const pollId = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(pollId); if (endTimer) clearTimeout(endTimer); };
  }, [channelId]);

  // Tick once per second so the progress bar and "m elapsed / m remaining" stay live
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1_000_000), 1000);
    return () => clearInterval(id);
  }, []);

  if (!nowData || !nowData.nowPlaying) {
    return (
      <div className="vt-fadein" style={{ padding: 16, background: c.surfaceAlt, border: `2px solid ${c.border}40`, fontSize: 13, color: c.textDim, fontWeight: 700 }}>
        Nothing currently playing
      </div>
    );
  }

  const startMs = nowData.startTime ? new Date(nowData.startTime).getTime() : 0;
  const endMs = nowData.endTime ? new Date(nowData.endTime).getTime() : 0;
  const total = Math.max(0, (endMs - startMs) / 1000);
  const elapsed = startMs ? Math.max(0, Math.min(total, (Date.now() - startMs) / 1000)) : 0;
  const progress = total > 0 ? Math.min((elapsed / total) * 100, 100) : 0;

  return (
    <div className="vt-fadein" style={{ padding: 16, background: c.surfaceAlt, border: `2px solid ${c.accent}60` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: c.danger, color: c.black, fontSize: 10, fontWeight: 800,
          padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.1em",
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%", background: c.black,
            animation: "vtPulseDot 1.2s ease-in-out infinite",
          }} />
          LIVE
        </span>
        <span style={{ fontSize: 16, fontWeight: 800 }}>{nowData.nowPlaying}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: c.textDim, fontWeight: 700 }}>
        <span>{formatTime(nowData.startTime!)}</span>
        <div style={{ flex: 1, height: 4, background: c.bg, position: "relative" }}>
          <div style={{ width: `${progress}%`, height: "100%", background: c.accent, transition: "width 1s linear" }} />
        </div>
        <span>{formatTime(nowData.endTime!)}</span>
      </div>
      <div style={{ fontSize: 11, color: c.textDim, marginTop: 6, fontWeight: 700 }}>
        {Math.floor(elapsed / 60)}m elapsed / {Math.max(0, Math.floor((total - elapsed) / 60))}m remaining
      </div>
    </div>
  );
}
