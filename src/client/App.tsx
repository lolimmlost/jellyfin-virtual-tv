import { useState, useEffect, useRef, useCallback } from "react";
import type { Channel, ChannelFilter, JellyfinLibrary, ScheduleSlot } from "../shared/types";

// ── Neo-Brutalism Dark ──────────────────────────────────────────

const c = {
  bg: "#141414",
  surface: "#1e1e1e",
  surfaceAlt: "#252525",
  accent: "#FF6B6B",
  yellow: "#FFD93D",
  text: "#f0f0f0",
  textDim: "#888888",
  border: "#e8e8e8",
  black: "#000000",
  danger: "#FF4444",
  success: "#00FF00",
};

const font = "Space Grotesk, sans-serif";

// ── Styles ───────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: c.bg,
  color: c.text,
  border: `3px solid ${c.border}`,
  borderRadius: 0,
  padding: "8px 12px",
  fontSize: 14,
  fontFamily: font,
  fontWeight: 700,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const buttonStyle: React.CSSProperties = {
  background: c.yellow,
  border: `3px solid ${c.border}`,
  borderRadius: 0,
  padding: "8px 16px",
  cursor: "pointer",
  color: c.black,
  fontWeight: 800,
  fontFamily: font,
  fontSize: 13,
  textTransform: "uppercase",
  boxShadow: `3px 3px 0px 0px ${c.border}`,
  transition: "transform 0.1s, box-shadow 0.1s",
};

// ── Helpers ─────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDuration(ticks: number): string {
  const mins = Math.round(ticks / 10_000_000 / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDateHeader(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

// ── Main App ────────────────────────────────────────────────────

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<{ connected: boolean; serverName?: string } | null>(null);

  const selectedChannel = channels.find((c) => c.id === selectedId) || null;

  // Load font + neon animation
  useEffect(() => {
    if (!document.getElementById("font-space-grotesk")) {
      const link = document.createElement("link");
      link.id = "font-space-grotesk";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&display=swap";
      document.head.appendChild(link);
    }
    if (!document.getElementById("neon-keyframes")) {
      const style = document.createElement("style");
      style.id = "neon-keyframes";
      style.textContent = `
        @keyframes neonFlicker {
          0%, 100% { text-shadow: 0 0 4px #FFD93D, 0 0 11px #FFD93D, 0 0 19px #FFD93D, 0 0 40px #FF6B6B, 0 0 80px #FF6B6B; opacity: 1; }
          18% { text-shadow: 0 0 4px #FFD93D, 0 0 11px #FFD93D, 0 0 19px #FFD93D, 0 0 40px #FF6B6B, 0 0 80px #FF6B6B; opacity: 1; }
          20% { text-shadow: none; opacity: 0.6; }
          22% { text-shadow: 0 0 4px #FFD93D, 0 0 11px #FFD93D, 0 0 19px #FFD93D, 0 0 40px #FF6B6B, 0 0 80px #FF6B6B; opacity: 1; }
          55% { text-shadow: 0 0 4px #FFD93D, 0 0 11px #FFD93D, 0 0 19px #FFD93D, 0 0 40px #FF6B6B, 0 0 80px #FF6B6B; opacity: 1; }
          57% { text-shadow: none; opacity: 0.5; }
          58% { text-shadow: 0 0 2px #FFD93D, 0 0 6px #FFD93D; opacity: 0.8; }
          60% { text-shadow: 0 0 4px #FFD93D, 0 0 11px #FFD93D, 0 0 19px #FFD93D, 0 0 40px #FF6B6B, 0 0 80px #FF6B6B; opacity: 1; }
        }
        @keyframes neonPulse {
          0%, 100% { text-shadow: 0 0 4px #FF6B6B, 0 0 10px #FF6B6B, 0 0 20px #FF6B6B, 0 0 40px #FF6B6B; }
          50% { text-shadow: 0 0 2px #FF6B6B, 0 0 5px #FF6B6B, 0 0 10px #FF6B6B; }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    loadChannels();
    fetch("/api/jellyfin/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false }));
  }, []);

  function loadChannels() {
    fetch("/api/channels")
      .then((r) => r.json())
      .then((data) => setChannels(data.channels || []))
      .catch((err) => console.error("Failed to load channels:", err));
  }

  async function createChannel() {
    const maxNum = channels.reduce((max, ch) => Math.max(max, ch.number), 0);
    const body = {
      name: `Channel ${maxNum + 1}`,
      number: maxNum + 1,
      filters: {},
      shuffleMode: "random",
    };
    const res = await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      setChannels((prev) => [...prev, data.channel]);
      setSelectedId(data.channel.id);
      setEditing(true);
    }
  }

  async function saveChannel(updated: Channel) {
    const res = await fetch(`/api/channels/${updated.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: updated.name,
        number: updated.number,
        filters: updated.filters,
        shuffleMode: updated.shuffleMode,
        streamMode: updated.streamMode,
        audioLanguage: updated.audioLanguage,
        logoUrl: updated.logoUrl,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setChannels((prev) => prev.map((ch) => (ch.id === data.channel.id ? data.channel : ch)));
      setEditing(false);
    }
  }

  async function deleteChannel(id: string) {
    const res = await fetch(`/api/channels/${id}`, { method: "DELETE" });
    if (res.ok) {
      setChannels((prev) => prev.filter((ch) => ch.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setEditing(false);
      }
    }
  }

  return (
    <div style={{
      background: c.bg, color: c.text, minHeight: "100vh", fontFamily: font,
      backgroundImage: "radial-gradient(#ffffff08 1.5px, transparent 1.5px)",
      backgroundSize: "20px 20px",
    }}>
      {/* Header */}
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "16px 24px", borderBottom: `4px solid ${c.border}`, background: c.bg,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <h1 style={{
            margin: 0, fontSize: 24, fontWeight: 800, color: c.text, fontFamily: font,
            background: c.accent, padding: "4px 14px", border: `4px solid ${c.border}`, lineHeight: 1.3,
            animation: "neonPulse 3s ease-in-out infinite",
          }}>Virtual TV</h1>
          <span style={{
            fontSize: 10, fontWeight: 800, fontFamily: font, color: c.textDim,
            textTransform: "uppercase", letterSpacing: "0.15em", lineHeight: 1,
          }}>
            <span style={{ display: "block", fontSize: 9, letterSpacing: "0.2em", opacity: 0.6 }}>by</span>
            <span style={{
              color: c.yellow, fontSize: 13, letterSpacing: "0.1em",
              animation: "neonFlicker 4s ease-in-out infinite",
            }}>AppaHouse</span>
          </span>
        </div>
        <StatusPill status={status} />
      </header>

      <div style={{ display: "flex", height: "calc(100vh - 61px)" }}>
        {/* Left panel: Channel list */}
        <div style={{
          width: 300, borderRight: `4px solid ${c.border}`, display: "flex", flexDirection: "column",
          background: c.bg,
        }}>
          <div style={{ padding: 16 }}>
            <button onClick={createChannel} style={{ ...buttonStyle, width: "100%", padding: "12px 16px" }}>
              + New Channel
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {channels.map((ch) => {
              const active = selectedId === ch.id;
              return (
                <div
                  key={ch.id}
                  onClick={() => { setSelectedId(ch.id); setEditing(false); }}
                  style={{
                    padding: "12px 16px", cursor: "pointer",
                    background: active ? c.surface : "transparent",
                    borderLeft: active ? `4px solid ${c.accent}` : "4px solid transparent",
                    borderBottom: `2px solid ${c.border}20`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      color: c.black, fontSize: 12, fontWeight: 800, fontFamily: font,
                      background: c.yellow, border: `2px solid ${c.border}`,
                      padding: "1px 6px", minWidth: 28, textAlign: "center",
                    }}>
                      {ch.number}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{ch.name}</span>
                  </div>
                  <div style={{
                    fontSize: 11, color: c.textDim, marginTop: 4, marginLeft: 44, fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220,
                  }}>
                    {ch.shuffleMode} · {ch.streamMode === "copy" ? "passthrough" : "transcode"} · {summarizeFilters(ch.filters)}
                  </div>
                </div>
              );
            })}
            {channels.length === 0 && (
              <div style={{ padding: 24, color: c.textDim, fontSize: 13, textAlign: "center", fontWeight: 700 }}>
                No channels yet.
              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {selectedChannel && !editing && (
            <ChannelDetail
              channel={selectedChannel}
              onEdit={() => setEditing(true)}
              onDelete={() => deleteChannel(selectedChannel.id)}
            />
          )}
          {selectedChannel && editing && (
            <ChannelEditor
              key={selectedChannel.id}
              channel={selectedChannel}
              onSave={saveChannel}
              onCancel={() => setEditing(false)}
            />
          )}
          {!selectedChannel && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center", height: "100%",
              color: c.textDim, fontSize: 16, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}>
              Select a channel or create one
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Now Playing ────────────────────────────────────────────────

function NowPlaying({ channelId }: { channelId: string }) {
  const [nowData, setNowData] = useState<{
    channel: string;
    nowPlaying: string | null;
    offsetSeconds?: number;
    startTime?: string;
    endTime?: string;
  } | null>(null);

  useEffect(() => {
    fetch(`/iptv/now/${channelId}`)
      .then((r) => r.json())
      .then(setNowData)
      .catch(() => setNowData(null));
  }, [channelId]);

  if (!nowData || !nowData.nowPlaying) {
    return (
      <div style={{ padding: 16, background: c.surfaceAlt, border: `2px solid ${c.border}40`, fontSize: 13, color: c.textDim, fontWeight: 700 }}>
        Nothing currently playing
      </div>
    );
  }

  const elapsed = nowData.offsetSeconds || 0;
  const total = nowData.startTime && nowData.endTime
    ? (new Date(nowData.endTime).getTime() - new Date(nowData.startTime).getTime()) / 1000
    : 0;
  const progress = total > 0 ? Math.min((elapsed / total) * 100, 100) : 0;

  return (
    <div style={{ padding: 16, background: c.surfaceAlt, border: `2px solid ${c.accent}60` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{
          background: c.danger, color: c.black, fontSize: 10, fontWeight: 800,
          padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.1em",
        }}>LIVE</span>
        <span style={{ fontSize: 16, fontWeight: 800 }}>{nowData.nowPlaying}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: c.textDim, fontWeight: 700 }}>
        <span>{formatTime(nowData.startTime!)}</span>
        <div style={{ flex: 1, height: 4, background: c.bg, position: "relative" }}>
          <div style={{ width: `${progress}%`, height: "100%", background: c.accent, transition: "width 1s" }} />
        </div>
        <span>{formatTime(nowData.endTime!)}</span>
      </div>
      <div style={{ fontSize: 11, color: c.textDim, marginTop: 6, fontWeight: 700 }}>
        {Math.floor(elapsed / 60)}m elapsed / {Math.floor((total - elapsed) / 60)}m remaining
      </div>
    </div>
  );
}

// ── Schedule Guide ─────────────────────────────────────────────

function ScheduleGuide({ channelId, maxSlots, compact }: { channelId: string; maxSlots?: number; compact?: boolean }) {
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const nowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/iptv/schedule/${channelId}`)
      .then((r) => r.json())
      .then((data) => {
        setSlots(data.slots || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [channelId]);

  // Auto-scroll to "now playing" within the schedule's scroll container (not the page)
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!loading && nowRef.current) {
      // Find the nearest scrollable ancestor
      const item = nowRef.current;
      const container = scrollContainerRef.current;
      if (container) {
        // For non-compact: container itself scrolls
        // For compact: walk up to the scrollable parent (sticky sidebar)
        const scroller = container.scrollHeight > container.clientHeight
          ? container
          : container.closest<HTMLElement>("[data-scroll-container]") || container.parentElement;
        if (scroller) {
          const itemRect = item.getBoundingClientRect();
          const scrollerRect = scroller.getBoundingClientRect();
          scroller.scrollTop += itemRect.top - scrollerRect.top;
        }
      }
    }
  }, [loading, slots]);

  if (loading) {
    return <div style={{ color: c.textDim, fontSize: 13, fontWeight: 700, padding: 16 }}>Loading schedule...</div>;
  }

  if (slots.length === 0) {
    return <div style={{ color: c.textDim, fontSize: 13, fontWeight: 700, padding: 16 }}>No content scheduled</div>;
  }

  const now = Date.now();
  const displaySlots = maxSlots ? slots.slice(0, maxSlots) : slots;
  const imgSize = compact ? { w: 48, h: 28 } : { w: 64, h: 36 };

  // Group by date
  const groups: { date: string; slots: ScheduleSlot[] }[] = [];
  for (const slot of displaySlots) {
    const dateKey = new Date(slot.startTime).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.date === dateKey) {
      last.slots.push(slot);
    } else {
      groups.push({ date: dateKey, slots: [slot] });
    }
  }

  return (
    <div ref={scrollContainerRef} style={{ display: "flex", flexDirection: "column", gap: 0, maxHeight: compact ? undefined : 600, overflowY: compact ? undefined : "auto", position: "relative" }}>
      {groups.map((group) => (
        <div key={group.date}>
          <div style={{
            fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em",
            color: c.yellow, padding: "10px 0 6px", borderBottom: `1px solid ${c.border}20`,
          }}>
            {formatDateHeader(group.slots[0].startTime)}
          </div>
          {group.slots.map((slot, i) => {
            const isCurrent = now >= new Date(slot.startTime).getTime() && now < new Date(slot.endTime).getTime();
            const isPast = new Date(slot.endTime).getTime() < now;
            return (
              <div
                key={`${slot.itemId}-${i}`}
                ref={isCurrent ? nowRef : undefined}
                style={{
                  display: "flex", gap: compact ? 8 : 12, padding: compact ? "6px 0" : "8px 0",
                  borderBottom: `1px solid ${c.border}10`,
                  opacity: isPast ? 0.35 : 1,
                  background: isCurrent ? `${c.accent}08` : "transparent",
                  borderLeft: isCurrent ? `3px solid ${c.accent}` : "3px solid transparent",
                  paddingLeft: 8,
                  transition: "opacity 0.2s",
                }}
              >
                {slot.imageUrl && (
                  <img
                    src={slot.imageUrl}
                    alt=""
                    style={{
                      width: imgSize.w, height: imgSize.h, objectFit: "cover",
                      border: `2px solid ${isCurrent ? c.accent : c.border}40`, flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {isCurrent && (
                      <span style={{
                        background: c.accent, color: c.black, fontSize: 9, fontWeight: 800,
                        padding: "1px 5px", textTransform: "uppercase", flexShrink: 0,
                      }}>NOW</span>
                    )}
                    <span style={{
                      fontSize: compact ? 12 : 13, fontWeight: 700,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{slot.title}</span>
                  </div>
                  <div style={{ fontSize: compact ? 10 : 11, color: c.textDim, fontWeight: 700, marginTop: 2 }}>
                    {formatTime(slot.startTime)} - {formatTime(slot.endTime)} · {formatDuration(slot.durationTicks)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Channel Detail ──────────────────────────────────────────────

function ChannelDetail({ channel, onEdit, onDelete }: {
  channel: Channel;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>{channel.name}</h2>
          <span style={{ color: c.textDim, fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Channel {channel.number} · {channel.shuffleMode} · {channel.streamMode === "copy" ? "passthrough" : "transcode"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onEdit} style={buttonStyle}>Edit</button>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} style={{
              ...buttonStyle, background: c.surface, color: c.danger,
              boxShadow: `3px 3px 0px 0px ${c.border}`,
            }}>
              Delete
            </button>
          ) : (
            <button onClick={() => { onDelete(); setConfirmDelete(false); }} style={{
              ...buttonStyle, background: c.danger, color: c.black,
            }}>
              Confirm
            </button>
          )}
        </div>
      </div>

      <Section title="Now Playing">
        <NowPlaying channelId={channel.id} />
      </Section>

      <div style={{ display: "flex", gap: 24 }}>
        <div style={{ flex: 1 }}>
          <Section title="Filters">
            <FilterSummary filters={channel.filters} />
          </Section>
        </div>
        <div style={{ flex: 1 }}>
          <Section title="Settings">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <DetailRow label="Shuffle" value={channel.shuffleMode} />
              <DetailRow label="Stream" value={channel.streamMode === "copy" ? "Passthrough" : "Transcode"} />
              <DetailRow label="Audio" value={channel.audioLanguage || "eng"} />
            </div>
          </Section>
        </div>
      </div>

      <Section title="48h Schedule">
        <ScheduleGuide channelId={channel.id} />
      </Section>
    </div>
  );
}

// ── Channel Editor ──────────────────────────────────────────────

function ChannelEditor({ channel, onSave, onCancel }: {
  channel: Channel;
  onSave: (ch: Channel) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(channel.name);
  const [number, setNumber] = useState(channel.number);
  const [shuffleMode, setShuffleMode] = useState(channel.shuffleMode);
  const [streamMode, setStreamMode] = useState(channel.streamMode || "transcode");
  const [audioLanguage, setAudioLanguage] = useState(channel.audioLanguage || "eng");
  const [filters, setFilters] = useState<ChannelFilter>(channel.filters);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ ...channel, name, number, shuffleMode, streamMode, audioLanguage, filters });
  }

  return (
    <div style={{ display: "flex", gap: 24 }}>
      {/* Editor form */}
      <form onSubmit={handleSubmit} style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Edit Channel</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onCancel} style={{
              ...buttonStyle, background: c.surface, color: c.text,
            }}>
              Cancel
            </button>
            <button type="submit" style={{ ...buttonStyle, background: c.accent, color: c.black }}>
              Save
            </button>
          </div>
        </div>

        <Section title="General">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g. Cartoon Network" />
          </Field>
          <Field label="Channel Number">
            <input type="number" value={number} onChange={(e) => setNumber(parseInt(e.target.value, 10) || 1)} style={{ ...inputStyle, width: 100 }} min={1} />
          </Field>
          <Field label="Shuffle Mode">
            <div style={{ display: "flex", gap: 8 }}>
              {(["random", "sequential"] as const).map((mode) => (
                <button key={mode} type="button" onClick={() => setShuffleMode(mode)} style={{
                  ...buttonStyle,
                  background: shuffleMode === mode ? c.accent : c.surface,
                  color: shuffleMode === mode ? c.black : c.text,
                  padding: "8px 16px",
                }}>
                  {mode}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Stream Mode">
            <div style={{ display: "flex", gap: 8 }}>
              {([["transcode", "Transcode"], ["copy", "Passthrough"]] as const).map(([mode, label]) => (
                <button key={mode} type="button" onClick={() => setStreamMode(mode)} style={{
                  ...buttonStyle,
                  background: streamMode === mode ? c.accent : c.surface,
                  color: streamMode === mode ? c.black : c.text,
                  padding: "8px 16px",
                }}>
                  {label}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 11, color: c.textDim, marginTop: 6, display: "block", fontWeight: 700 }}>
              {streamMode === "transcode"
                ? "Normalizes all media to H.264+AAC — smooth transitions between episodes with different formats"
                : "Passes through original codecs — lower CPU but may glitch if episodes have different codecs/resolutions"}
            </span>
          </Field>
          <Field label="Audio Language">
            <div style={{ display: "flex", gap: 8 }}>
              {([["eng", "English"], ["jpn", "Japanese"], ["spa", "Spanish"]] as const).map(([code, label]) => (
                <button key={code} type="button" onClick={() => setAudioLanguage(code)} style={{
                  ...buttonStyle,
                  background: audioLanguage === code ? c.accent : c.surface,
                  color: audioLanguage === code ? c.black : c.text,
                  padding: "8px 16px",
                }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              <input
                value={audioLanguage}
                onChange={(e) => setAudioLanguage(e.target.value.toLowerCase())}
                style={{ ...inputStyle, width: 120 }}
                placeholder="ISO 639-2 code"
              />
            </div>
            <span style={{ fontSize: 11, color: c.textDim, marginTop: 6, display: "block", fontWeight: 700 }}>
              Preferred audio track language (ISO 639-2 code). Falls back to first available track if not found.
            </span>
          </Field>
        </Section>

        <Section title="Content Filters">
          <p style={{ color: c.textDim, fontSize: 13, marginTop: 0, marginBottom: 16, fontWeight: 700 }}>
            Define what media this channel pulls from Jellyfin. Leave empty to include everything.
          </p>
          <FilterEditor filters={filters} onChange={setFilters} />
        </Section>
      </form>

      {/* Schedule preview sidebar */}
      <div style={{ width: 340, flexShrink: 0 }}>
        <div data-scroll-container style={{
          position: "sticky", top: 0,
          background: c.surface, border: `4px solid ${c.border}`,
          boxShadow: `6px 6px 0px 0px ${c.border}`, padding: 16,
          maxHeight: "calc(100vh - 120px)", overflowY: "auto",
        }}>
          <h3 style={{
            margin: "0 0 12px", fontSize: 13, textTransform: "uppercase",
            letterSpacing: "0.15em", color: c.textDim, fontWeight: 800,
          }}>
            48h Schedule Preview
          </h3>
          <ScheduleGuide channelId={channel.id} compact />
        </div>
      </div>
    </div>
  );
}

// ── Filter Editor ───────────────────────────────────────────────

function FilterEditor({ filters, onChange }: {
  filters: ChannelFilter;
  onChange: (f: ChannelFilter) => void;
}) {
  const [libraries, setLibraries] = useState<JellyfinLibrary[]>([]);
  const [availableGenres, setAvailableGenres] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/jellyfin/libraries")
      .then((r) => r.json())
      .then((data) => setLibraries(data.libraries || []))
      .catch(() => {});
    fetch("/api/jellyfin/genres")
      .then((r) => r.json())
      .then((data) => setAvailableGenres(data.genres || []))
      .catch(() => {});
  }, []);

  function updateFilter<K extends keyof ChannelFilter>(key: K, value: ChannelFilter[K]) {
    onChange({ ...filters, [key]: value });
  }

  function toggleLibrary(itemId: string) {
    const current = filters.libraryIds || [];
    const next = current.includes(itemId)
      ? current.filter((id) => id !== itemId)
      : [...current, itemId];
    updateFilter("libraryIds", next.length > 0 ? next : undefined);
  }

  function toggleItemType(type: "Movie" | "Episode") {
    const current = filters.itemTypes || [];
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    updateFilter("itemTypes", next.length > 0 ? next : undefined);
  }

  function toggleGenre(genre: string) {
    const current = filters.genres || [];
    const next = current.includes(genre)
      ? current.filter((g) => g !== genre)
      : [...current, genre];
    updateFilter("genres", next.length > 0 ? next : undefined);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Field label="Libraries">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {libraries.map((lib) => {
            const selected = (filters.libraryIds || []).includes(lib.ItemId);
            return (
              <button key={lib.ItemId} type="button" onClick={() => toggleLibrary(lib.ItemId)} style={{
                ...buttonStyle, padding: "6px 14px", fontSize: 12,
                background: selected ? c.accent : c.surface,
                color: selected ? c.black : c.text,
              }}>
                {lib.Name}
              </button>
            );
          })}
          {libraries.length === 0 && (
            <span style={{ color: c.textDim, fontSize: 13, fontWeight: 700 }}>
              No libraries — check Jellyfin connection
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: c.textDim, marginTop: 6, display: "block", fontWeight: 700, textTransform: "uppercase" }}>
          {filters.libraryIds?.length ? `${filters.libraryIds.length} selected` : "All libraries"}
        </span>
      </Field>

      <Field label="Item Types">
        <div style={{ display: "flex", gap: 8 }}>
          {(["Movie", "Episode"] as const).map((type) => {
            const selected = (filters.itemTypes || []).includes(type);
            return (
              <button key={type} type="button" onClick={() => toggleItemType(type)} style={{
                ...buttonStyle, padding: "6px 14px", fontSize: 12,
                background: selected ? c.accent : c.surface,
                color: selected ? c.black : c.text,
              }}>
                {type === "Episode" ? "TV Episodes" : "Movies"}
              </button>
            );
          })}
        </div>
        <span style={{ fontSize: 11, color: c.textDim, marginTop: 6, display: "block", fontWeight: 700, textTransform: "uppercase" }}>
          {filters.itemTypes?.length ? filters.itemTypes.join(", ") : "All types"}
        </span>
      </Field>

      <Field label="Genres">
        <GenrePicker
          availableGenres={availableGenres}
          selectedGenres={filters.genres || []}
          onToggle={toggleGenre}
        />
      </Field>

      <Field label="Tags">
        <TagInput
          values={filters.tags || []}
          onChange={(v) => updateFilter("tags", v.length > 0 ? v : undefined)}
          placeholder="Type a tag and press Enter"
        />
      </Field>

      <Field label="Title Match">
        <input
          value={filters.titleMatch || ""}
          onChange={(e) => updateFilter("titleMatch", e.target.value || undefined)}
          style={inputStyle}
          placeholder="e.g. Scream, Scary Movie, Tucker and Dale"
        />
      </Field>
    </div>
  );
}

// ── Genre Picker ───────────────────────────────────────────────

function GenrePicker({ availableGenres, selectedGenres, onToggle }: {
  availableGenres: string[];
  selectedGenres: string[];
  onToggle: (genre: string) => void;
}) {
  const [customInput, setCustomInput] = useState("");

  function handleCustomKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = customInput.trim();
      if (trimmed && !selectedGenres.includes(trimmed)) {
        onToggle(trimmed);
      }
      setCustomInput("");
    }
  }

  return (
    <div>
      {/* Selected genres */}
      {selectedGenres.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {selectedGenres.map((genre) => (
            <span key={genre} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: c.accent, color: c.black, padding: "2px 10px",
              border: `2px solid ${c.border}`, fontSize: 12, fontWeight: 800,
              fontFamily: font, textTransform: "uppercase",
            }}>
              {genre}
              <span onClick={() => onToggle(genre)} style={{ cursor: "pointer", opacity: 0.7, marginLeft: 2, fontSize: 14 }}>x</span>
            </span>
          ))}
        </div>
      )}

      {/* Available genres grid */}
      {availableGenres.length > 0 && (
        <div style={{
          display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8,
          maxHeight: 120, overflowY: "auto", padding: 4,
          background: c.bg, border: `2px solid ${c.border}30`,
        }}>
          {availableGenres.map((genre) => {
            const selected = selectedGenres.includes(genre);
            return (
              <button key={genre} type="button" onClick={() => onToggle(genre)} style={{
                background: selected ? c.accent : "transparent",
                color: selected ? c.black : c.textDim,
                border: `1px solid ${selected ? c.accent : c.border}40`,
                padding: "3px 10px", fontSize: 11, fontWeight: 700,
                fontFamily: font, cursor: "pointer", borderRadius: 0,
                transition: "all 0.1s",
              }}>
                {genre}
              </button>
            );
          })}
        </div>
      )}

      {/* Custom genre input */}
      <input
        value={customInput}
        onChange={(e) => setCustomInput(e.target.value)}
        onKeyDown={handleCustomKeyDown}
        style={{ ...inputStyle, fontSize: 12 }}
        placeholder="Or type a custom genre and press Enter"
      />
    </div>
  );
}

// ── Tag Input ───────────────────────────────────────────────────

function TagInput({ values, onChange, placeholder }: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = input.trim();
      if (trimmed && !values.includes(trimmed)) {
        onChange([...values, trimmed]);
      }
      setInput("");
    }
    if (e.key === "Backspace" && input === "" && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  function removeTag(tag: string) {
    onChange(values.filter((v) => v !== tag));
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: values.length > 0 ? 8 : 0 }}>
        {values.map((tag) => (
          <span key={tag} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: c.accent, color: c.black, padding: "2px 10px",
            border: `2px solid ${c.border}`, fontSize: 12, fontWeight: 800,
            fontFamily: font, textTransform: "uppercase",
          }}>
            {tag}
            <span onClick={() => removeTag(tag)} style={{ cursor: "pointer", opacity: 0.7, marginLeft: 2, fontSize: 14 }}>x</span>
          </span>
        ))}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        style={inputStyle}
        placeholder={values.length === 0 ? placeholder : "Add another..."}
      />
    </div>
  );
}

// ── Shared Components ───────────────────────────────────────────

function StatusPill({ status }: { status: { connected: boolean; serverName?: string } | null }) {
  if (!status) return <span style={{ color: c.textDim, fontSize: 13, fontFamily: font }}>Checking...</span>;
  const connected = status.connected;
  const label = connected ? `Connected to ${status.serverName}` : "Disconnected";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontFamily: font }}>
      <div style={{
        width: 12, height: 12, borderRadius: 0, border: `2px solid ${c.border}`,
        background: connected ? c.success : c.danger,
      }} />
      <span style={{ color: connected ? c.text : c.danger, fontWeight: 700 }}>{label}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{
        margin: "0 0 12px", fontSize: 13, textTransform: "uppercase",
        letterSpacing: "0.15em", color: c.textDim, fontWeight: 800,
      }}>
        {title}
      </h3>
      <div style={{
        background: c.surface, border: `4px solid ${c.border}`, borderRadius: 0,
        padding: 20, boxShadow: `6px 6px 0px 0px ${c.border}`,
      }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: "block", fontSize: 12, color: c.textDim, marginBottom: 6,
        fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em",
      }}>{label}</label>
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
      <span style={{ color: c.textDim, fontWeight: 700, textTransform: "uppercase", fontSize: 11, letterSpacing: "0.05em" }}>{label}</span>
      <span style={{ fontWeight: 800 }}>{value}</span>
    </div>
  );
}

function FilterSummary({ filters }: { filters: ChannelFilter }) {
  const parts: string[] = [];
  if (filters.libraryIds?.length) parts.push(`${filters.libraryIds.length} libraries`);
  if (filters.itemTypes?.length) parts.push(filters.itemTypes.join(", "));
  if (filters.genres?.length) parts.push(`Genres: ${filters.genres.join(", ")}`);
  if (filters.tags?.length) parts.push(`Tags: ${filters.tags.join(", ")}`);
  if (filters.titleMatch) parts.push(`Title: "${filters.titleMatch}"`);

  if (parts.length === 0) {
    return <span style={{ color: c.textDim, fontSize: 14, fontWeight: 700 }}>No filters — all media included</span>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {parts.map((p, i) => (
        <span key={i} style={{ fontSize: 14, fontWeight: 700 }}>{p}</span>
      ))}
    </div>
  );
}

function summarizeFilters(filters: ChannelFilter): string {
  const parts: string[] = [];
  if (filters.genres?.length) parts.push(filters.genres.slice(0, 2).join(", "));
  if (filters.itemTypes?.length) parts.push(filters.itemTypes.join("/"));
  if (filters.titleMatch) parts.push(`"${filters.titleMatch}"`);
  return parts.length > 0 ? parts.join(" · ") : "no filters";
}
