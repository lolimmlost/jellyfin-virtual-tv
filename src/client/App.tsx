import { useState, useEffect } from "react";
import type { JellyfinLibrary, JellyfinItem } from "../shared/types";

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
};

const font = "Space Grotesk, sans-serif";

// ── Helpers ──────────────────────────────────────────────────────

function formatRuntime(ticks: number): string {
  const totalSeconds = Math.floor(ticks / 10_000_000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatEpisode(item: JellyfinItem): string {
  if (item.Type !== "Episode") return item.Name;
  const season = item.ParentIndexNumber;
  const episode = item.IndexNumber;
  const tag = season != null && episode != null
    ? `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`
    : "";
  const series = item.SeriesName || "";
  return [series, tag, item.Name].filter(Boolean).join(" — ");
}

// ── SVG Icons ───────────────────────────────────────────────────

function GridIcon({ active }: { active: boolean }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={active ? c.black : c.textDim} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function ListIcon({ active }: { active: boolean }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={active ? c.black : c.textDim} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

// ── Styles ───────────────────────────────────────────────────────

const styles = {
  page: {
    background: c.bg, color: c.text, minHeight: "100vh", fontFamily: font,
    backgroundImage: "radial-gradient(#ffffff08 1.5px, transparent 1.5px)",
    backgroundSize: "20px 20px",
  } as React.CSSProperties,

  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "16px 24px", borderBottom: `4px solid ${c.border}`,
    background: c.bg,
  } as React.CSSProperties,

  title: {
    margin: 0, fontSize: 24, fontWeight: 800, color: c.text, fontFamily: font,
    background: c.accent, padding: "4px 14px", border: `4px solid ${c.border}`,
    lineHeight: 1.3,
  } as React.CSSProperties,

  sectionLabel: {
    fontSize: 13, color: c.textDim, marginBottom: 12,
    textTransform: "uppercase" as const, letterSpacing: "0.15em", fontWeight: 800,
  } as React.CSSProperties,

  button: {
    background: c.yellow, border: `4px solid ${c.border}`, borderRadius: 0,
    padding: "12px 20px", cursor: "pointer", color: c.black,
    textAlign: "left" as const, fontWeight: 800, fontFamily: font,
    boxShadow: `4px 4px 0px 0px ${c.border}`,
    transition: "transform 0.1s, box-shadow 0.1s",
    textTransform: "uppercase" as const, fontSize: 13,
  } as React.CSSProperties,

  buttonActive: {
    background: c.accent, color: c.black,
    boxShadow: `6px 6px 0px 0px ${c.border}`,
    transform: "translate(-1px, -1px)",
  } as React.CSSProperties,

  card: {
    background: c.surface, border: `4px solid ${c.border}`, borderRadius: 0,
    boxShadow: `8px 8px 0px 0px ${c.border}`, padding: 16,
    transition: "transform 0.1s ease-out, box-shadow 0.1s ease-out",
  } as React.CSSProperties,

  badge: {
    fontSize: 11, padding: "2px 8px", borderRadius: 0, fontWeight: 800,
    background: c.accent, color: c.black, border: `2px solid ${c.border}`,
    textTransform: "uppercase" as const, letterSpacing: "0.05em",
    fontFamily: font, display: "inline-block",
  } as React.CSSProperties,

  genreTag: {
    fontSize: 11, padding: "1px 6px", borderRadius: 0,
    border: `2px solid ${c.border}`, color: c.textDim, fontWeight: 700,
    fontFamily: font,
  } as React.CSSProperties,

  listRow: {
    display: "flex", alignItems: "center", gap: 16, padding: "12px 16px",
    background: c.surface, borderBottom: `3px solid ${c.border}`,
    transition: "background 0.1s",
  } as React.CSSProperties,

  viewToggle: (active: boolean): React.CSSProperties => ({
    background: active ? c.yellow : c.surfaceAlt,
    border: `3px solid ${c.border}`, borderRadius: 0,
    padding: "6px 8px", cursor: "pointer",
    boxShadow: active ? `3px 3px 0 ${c.border}` : "none",
    transition: "all 0.1s",
    display: "flex", alignItems: "center", justifyContent: "center",
  }),
};

interface Status {
  connected: boolean;
  serverName?: string;
  version?: string;
  error?: string;
}

// ── App ─────────────────────────────────────────────────────────

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [libraries, setLibraries] = useState<JellyfinLibrary[]>([]);
  const [selectedLibrary, setSelectedLibrary] = useState<string | null>(null);
  const [items, setItems] = useState<JellyfinItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Load font
  useEffect(() => {
    if (!document.getElementById("font-space-grotesk")) {
      const link = document.createElement("link");
      link.id = "font-space-grotesk";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    fetch("/api/jellyfin/status")
      .then((r) => r.json())
      .then((data) => {
        setStatus(data);
        if (data.connected) {
          return fetch("/api/jellyfin/libraries").then((r) => r.json());
        }
      })
      .then((data) => {
        if (data?.libraries) setLibraries(data.libraries);
      })
      .catch(() => setStatus({ connected: false, error: "Failed to reach server" }));
  }, []);

  function selectLibrary(itemId: string) {
    setSelectedLibrary(itemId);
    setLoading(true);
    fetch(`/api/jellyfin/items?parentId=${itemId}&limit=50`)
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items || []);
        setTotalCount(data.totalCount || 0);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.title}>Virtual TV</h1>
        <StatusPill status={status} />
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        {/* Libraries */}
        <div style={styles.sectionLabel}>Libraries</div>
        {libraries.length === 0 && status?.connected && (
          <p style={{ color: c.textDim }}>No libraries found.</p>
        )}
        {!status?.connected && status !== null && (
          <p style={{ color: c.accent, fontWeight: 800 }}>
            Not connected to Jellyfin.
          </p>
        )}
        <div style={{ display: "flex", gap: 12, marginBottom: 32, flexWrap: "wrap" }}>
          {libraries.map((lib) => {
            const active = selectedLibrary === lib.ItemId;
            return (
              <button
                key={lib.ItemId}
                onClick={() => selectLibrary(lib.ItemId)}
                style={{ ...styles.button, ...(active ? styles.buttonActive : {}) }}
              >
                <div>{lib.Name}</div>
                <div style={{ fontSize: 10, color: active ? c.black : c.textDim, marginTop: 2, fontWeight: 700 }}>
                  {lib.CollectionType}
                </div>
              </button>
            );
          })}
        </div>

        {/* Items */}
        {selectedLibrary && (
          <>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: 12,
            }}>
              <div style={styles.sectionLabel}>
                Items {totalCount > 0 && (
                  <span style={{ color: c.accent }}>({totalCount})</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => setViewMode("grid")} style={styles.viewToggle(viewMode === "grid")} title="Grid view">
                  <GridIcon active={viewMode === "grid"} />
                </button>
                <button onClick={() => setViewMode("list")} style={styles.viewToggle(viewMode === "list")} title="List view">
                  <ListIcon active={viewMode === "list"} />
                </button>
              </div>
            </div>

            {loading ? (
              <p style={{ color: c.textDim }}>Loading...</p>
            ) : viewMode === "grid" ? (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 12,
              }}>
                {items.map((item) => {
                  const hovered = hoveredCard === item.Id;
                  return (
                    <div
                      key={item.Id}
                      onMouseEnter={() => setHoveredCard(item.Id)}
                      onMouseLeave={() => setHoveredCard(null)}
                      style={{
                        ...styles.card,
                        ...(hovered ? {
                          transform: "translate(-2px, -2px)",
                          boxShadow: `10px 10px 0px 0px ${c.border}`,
                        } : {}),
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14, color: c.text }}>
                        {formatEpisode(item)}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                        <span style={styles.badge}>{item.Type}</span>
                        {item.RunTimeTicks > 0 && (
                          <span style={{ fontSize: 12, color: c.textDim }}>
                            {formatRuntime(item.RunTimeTicks)}
                          </span>
                        )}
                      </div>
                      {item.Genres && item.Genres.length > 0 && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {item.Genres.slice(0, 4).map((g) => (
                            <span key={g} style={styles.genreTag}>{g}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ border: `4px solid ${c.border}` }}>
                {items.map((item, i) => {
                  const hovered = hoveredCard === item.Id;
                  return (
                    <div
                      key={item.Id}
                      onMouseEnter={() => setHoveredCard(item.Id)}
                      onMouseLeave={() => setHoveredCard(null)}
                      style={{
                        ...styles.listRow,
                        background: hovered ? c.yellow : (i % 2 === 0 ? c.surface : c.surfaceAlt),
                        color: hovered ? c.black : c.text,
                        ...(i === items.length - 1 ? { borderBottom: "none" } : {}),
                      }}
                    >
                      <span style={{ ...styles.badge, flexShrink: 0, minWidth: 56, textAlign: "center" as const }}>
                        {item.Type}
                      </span>
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>
                        {formatEpisode(item)}
                      </span>
                      {item.Genres && item.Genres.length > 0 && (
                        <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          {item.Genres.slice(0, 2).map((g) => (
                            <span key={g} style={styles.genreTag}>{g}</span>
                          ))}
                        </span>
                      )}
                      {item.RunTimeTicks > 0 && (
                        <span style={{
                          fontSize: 12, color: hovered ? c.black : c.textDim, flexShrink: 0,
                          minWidth: 48, textAlign: "right" as const, fontWeight: 700,
                        }}>
                          {formatRuntime(item.RunTimeTicks)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {!selectedLibrary && libraries.length > 0 && (
          <p style={{ color: c.textDim }}>Select a library to browse its items.</p>
        )}
      </main>
    </div>
  );
}

// ── StatusPill ──────────────────────────────────────────────────

function StatusPill({ status }: { status: Status | null }) {
  if (!status) return <span style={{ color: c.textDim, fontSize: 13, fontFamily: font }}>Checking...</span>;

  const connected = status.connected;
  const label = connected ? `Connected to ${status.serverName}` : (status.error || "Disconnected");

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontFamily: font }}>
      <div style={{
        width: 12, height: 12, borderRadius: 0, border: `2px solid ${c.border}`,
        background: connected ? "#00FF00" : c.accent,
      }} />
      <span style={{
        color: connected ? c.text : c.accent, fontWeight: 700,
      }}>{label}</span>
    </div>
  );
}
