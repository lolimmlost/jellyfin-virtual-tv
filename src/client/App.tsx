import { useState, useEffect } from "react";
import type { Channel, ChannelFilter, JellyfinLibrary } from "../shared/types";

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
                  <div style={{ fontSize: 11, color: c.textDim, marginTop: 4, marginLeft: 44, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {ch.shuffleMode} · {summarizeFilters(ch.filters)}
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
            Channel {channel.number} · {channel.shuffleMode}
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

      <Section title="Filters">
        <FilterSummary filters={channel.filters} />
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
  const [filters, setFilters] = useState<ChannelFilter>(channel.filters);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ ...channel, name, number, shuffleMode, filters });
  }

  return (
    <form onSubmit={handleSubmit}>
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
      </Section>

      <Section title="Content Filters">
        <p style={{ color: c.textDim, fontSize: 13, marginTop: 0, marginBottom: 16, fontWeight: 700 }}>
          Define what media this channel pulls from Jellyfin. Leave empty to include everything.
        </p>
        <FilterEditor filters={filters} onChange={setFilters} />
      </Section>
    </form>
  );
}

// ── Filter Editor ───────────────────────────────────────────────

function FilterEditor({ filters, onChange }: {
  filters: ChannelFilter;
  onChange: (f: ChannelFilter) => void;
}) {
  const [libraries, setLibraries] = useState<JellyfinLibrary[]>([]);

  useEffect(() => {
    fetch("/api/jellyfin/libraries")
      .then((r) => r.json())
      .then((data) => setLibraries(data.libraries || []))
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
        <TagInput
          values={filters.genres || []}
          onChange={(v) => updateFilter("genres", v.length > 0 ? v : undefined)}
          placeholder="Type a genre and press Enter"
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
          placeholder="Substring match (e.g. Star Wars)"
        />
      </Field>
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
            <span onClick={() => removeTag(tag)} style={{ cursor: "pointer", opacity: 0.7, marginLeft: 2, fontSize: 14 }}>×</span>
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
