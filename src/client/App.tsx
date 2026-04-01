import { useState, useEffect } from "react";
import type { JellyfinLibrary, JellyfinItem } from "../shared/types";

// ── Design Systems ──────────────────────────────────────────────

interface DesignSystem {
  name: string;
  fonts: string;
  fontFamily: string;
  headingFamily: string;
  colors: {
    bg: string; surface: string; accent: string; secondary: string;
    text: string; textDim: string; border: string; heading: string;
  };
  card: React.CSSProperties;
  cardHover: React.CSSProperties;
  badge: React.CSSProperties;
  genreTag: React.CSSProperties;
  button: React.CSSProperties;
  buttonActive: React.CSSProperties;
  header: React.CSSProperties;
  sectionLabel: React.CSSProperties;
  pageStyle: React.CSSProperties;
  statusDot: (connected: boolean) => React.CSSProperties;
}

const systems: Record<string, DesignSystem> = {
  "Neo-Brutalism": {
    name: "Neo-Brutalism",
    fonts: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&display=swap",
    fontFamily: "Space Grotesk, sans-serif",
    headingFamily: "Space Grotesk, sans-serif",
    colors: {
      bg: "#FFFDF5", surface: "#FFFFFF", accent: "#FF6B6B", secondary: "#FFD93D",
      text: "#000000", textDim: "#000000", border: "#000000", heading: "#000000",
    },
    pageStyle: {
      backgroundImage: "radial-gradient(#00000015 1.5px, transparent 1.5px)",
      backgroundSize: "20px 20px",
    },
    card: {
      background: "#FFFFFF", border: "4px solid #000000", borderRadius: 0,
      boxShadow: "8px 8px 0px 0px #000000", padding: 16,
      transition: "transform 0.1s ease-out, box-shadow 0.1s ease-out",
    },
    cardHover: { transform: "translate(-2px, -2px)", boxShadow: "10px 10px 0px 0px #000000" },
    badge: {
      fontSize: 11, padding: "2px 8px", borderRadius: 0, fontWeight: 800,
      background: "#FF6B6B", color: "#000000", border: "2px solid #000000",
      textTransform: "uppercase" as const, letterSpacing: "0.05em",
    },
    genreTag: {
      fontSize: 11, padding: "1px 6px", borderRadius: 0,
      border: "2px solid #000000", color: "#000000", fontWeight: 700,
    },
    button: {
      background: "#FFD93D", border: "4px solid #000000", borderRadius: 0,
      padding: "12px 20px", cursor: "pointer", color: "#000000", textAlign: "left" as const,
      fontWeight: 800, boxShadow: "4px 4px 0px 0px #000000",
      transition: "transform 0.1s, box-shadow 0.1s", textTransform: "uppercase" as const,
    },
    buttonActive: {
      background: "#FF6B6B", boxShadow: "6px 6px 0px 0px #000000",
      transform: "translate(-1px, -1px)",
    },
    header: {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "16px 24px", borderBottom: "4px solid #000000", background: "#FFFDF5",
    },
    sectionLabel: {
      fontSize: 14, color: "#000000", marginBottom: 10, textTransform: "uppercase" as const,
      letterSpacing: "0.15em", fontWeight: 800,
    },
    statusDot: (c) => ({
      width: 12, height: 12, borderRadius: 0, border: "2px solid #000",
      background: c ? "#00FF00" : "#FF0000",
    }),
  },

  "90s Retro": {
    name: "90s Retro",
    fonts: "",
    fontFamily: "MS Sans Serif, Tahoma, Geneva, Verdana, sans-serif",
    headingFamily: "Arial Black, Impact, sans-serif",
    colors: {
      bg: "#C0C0C0", surface: "#FFFFFF", accent: "#0000FF", secondary: "#FFFF00",
      text: "#000000", textDim: "#000000", border: "#808080", heading: "#000080",
    },
    pageStyle: {
      backgroundImage: "linear-gradient(45deg, #b8b8b8 25%, transparent 25%), linear-gradient(-45deg, #b8b8b8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #b8b8b8 75%), linear-gradient(-45deg, transparent 75%, #b8b8b8 75%)",
      backgroundSize: "4px 4px",
      backgroundPosition: "0 0, 0 2px, 2px -2px, -2px 0px",
    },
    card: {
      background: "#FFFFFF", border: "2px solid", padding: 0, borderRadius: 0,
      borderColor: "#ffffff #808080 #808080 #ffffff",
      boxShadow: "inset -1px -1px 0 #404040, inset 1px 1px 0 #dfdfdf",
    },
    cardHover: {},
    badge: {
      fontSize: 11, padding: "1px 6px", borderRadius: 0, fontWeight: 700,
      background: "#000080", color: "#FFFFFF", border: "1px solid #000000",
      fontFamily: "Courier New, monospace", textTransform: "uppercase" as const,
    },
    genreTag: {
      fontSize: 10, padding: "0px 4px", borderRadius: 0,
      border: "1px solid #808080", color: "#000000",
      fontFamily: "Courier New, monospace",
    },
    button: {
      background: "#C0C0C0", border: "2px solid", borderRadius: 0,
      borderColor: "#ffffff #808080 #808080 #ffffff",
      boxShadow: "inset -1px -1px 0 #404040, inset 1px 1px 0 #dfdfdf",
      padding: "8px 16px", cursor: "pointer", color: "#000000", textAlign: "left" as const,
      fontWeight: 700, textTransform: "uppercase" as const, fontSize: 12,
    },
    buttonActive: {
      background: "#D0D0D0",
      borderColor: "#808080 #ffffff #ffffff #808080",
      boxShadow: "inset 1px 1px 0 #404040, inset -1px -1px 0 #dfdfdf",
    },
    header: {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "4px 8px",
      background: "linear-gradient(to right, #000080, #1084D0)",
      color: "#FFFFFF", borderBottom: "2px solid #808080",
    },
    sectionLabel: {
      fontSize: 12, color: "#000080", marginBottom: 8, textTransform: "uppercase" as const,
      letterSpacing: "0.1em", fontWeight: 700,
      fontFamily: "Arial Black, Impact, sans-serif",
    },
    statusDot: (c) => ({
      width: 8, height: 8, borderRadius: 0,
      background: c ? "#00FF00" : "#FF0000", border: "1px solid #000",
    }),
  },

  "Dark Minimal": {
    name: "Dark Minimal",
    fonts: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap",
    fontFamily: "Inter, system-ui, sans-serif",
    headingFamily: "Inter, system-ui, sans-serif",
    colors: {
      bg: "#0f0f0f", surface: "#1a1a1a", accent: "#7C3AED", secondary: "#7C3AED",
      text: "#e4e4e4", textDim: "#888", border: "#2a2a2a", heading: "#e4e4e4",
    },
    pageStyle: {},
    card: {
      background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, padding: 16,
      transition: "border-color 0.2s",
    },
    cardHover: { borderColor: "#3a3a3a" },
    badge: {
      fontSize: 11, padding: "2px 6px", borderRadius: 4, fontWeight: 600,
      background: "#7C3AED22", color: "#7C3AED",
    },
    genreTag: {
      fontSize: 11, padding: "1px 6px", borderRadius: 4,
      border: "1px solid #2a2a2a", color: "#888",
    },
    button: {
      background: "transparent", border: "1px solid #2a2a2a", borderRadius: 8,
      padding: "12px 20px", cursor: "pointer", color: "#e4e4e4", textAlign: "left" as const,
      transition: "border-color 0.2s",
    },
    buttonActive: { background: "#1a1a1a", borderColor: "#7C3AED" },
    header: {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "16px 24px", borderBottom: "1px solid #2a2a2a",
    },
    sectionLabel: {
      fontSize: 14, color: "#888", marginBottom: 10, textTransform: "uppercase" as const,
      letterSpacing: "0.05em", fontWeight: 500,
    },
    statusDot: (c) => ({
      width: 8, height: 8, borderRadius: "50%",
      background: c ? "#22c55e" : "#ef4444",
    }),
  },

  "Glassmorphism": {
    name: "Glassmorphism",
    fonts: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap",
    fontFamily: "Plus Jakarta Sans, sans-serif",
    headingFamily: "Plus Jakarta Sans, sans-serif",
    colors: {
      bg: "#0a0a1a", surface: "rgba(255,255,255,0.06)", accent: "#60a5fa",
      secondary: "#818cf8", text: "#f0f0ff", textDim: "rgba(255,255,255,0.45)",
      border: "rgba(255,255,255,0.1)", heading: "#f0f0ff",
    },
    pageStyle: {
      backgroundImage: "radial-gradient(ellipse at 20% 50%, #1e1b4b33 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, #1e3a5f33 0%, transparent 50%)",
    },
    card: {
      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16, padding: 16, backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      transition: "background 0.3s, border-color 0.3s",
    },
    cardHover: { background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.15)" },
    badge: {
      fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 600,
      background: "rgba(96,165,250,0.15)", color: "#60a5fa",
      border: "1px solid rgba(96,165,250,0.2)",
    },
    genreTag: {
      fontSize: 11, padding: "1px 8px", borderRadius: 20,
      border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)",
    },
    button: {
      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 12, padding: "12px 20px", cursor: "pointer",
      color: "#f0f0ff", textAlign: "left" as const, backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)", transition: "all 0.3s",
    },
    buttonActive: {
      background: "rgba(96,165,250,0.1)", borderColor: "rgba(96,165,250,0.3)",
      boxShadow: "0 0 20px rgba(96,165,250,0.1)",
    },
    header: {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)",
      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
    },
    sectionLabel: {
      fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 12,
      textTransform: "uppercase" as const, letterSpacing: "0.15em", fontWeight: 500,
    },
    statusDot: (c) => ({
      width: 8, height: 8, borderRadius: "50%",
      background: c ? "#34d399" : "#f87171",
      boxShadow: c ? "0 0 8px #34d39966" : "0 0 8px #f8717166",
    }),
  },

  "Terminal": {
    name: "Terminal",
    fonts: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap",
    fontFamily: "JetBrains Mono, monospace",
    headingFamily: "JetBrains Mono, monospace",
    colors: {
      bg: "#0a0a0a", surface: "#0a0a0a", accent: "#00ff41", secondary: "#00ff41",
      text: "#00ff41", textDim: "#00802080", border: "#00ff4130", heading: "#00ff41",
    },
    pageStyle: {
      backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 20px, #00ff4108 20px, #00ff4108 21px)",
    },
    card: {
      background: "transparent", border: "1px solid #00ff4130", borderRadius: 0, padding: 16,
      transition: "border-color 0.1s",
    },
    cardHover: { borderColor: "#00ff4160" },
    badge: {
      fontSize: 11, padding: "0px 6px", borderRadius: 0, fontWeight: 700,
      background: "#00ff4120", color: "#00ff41", border: "1px solid #00ff4140",
      fontFamily: "JetBrains Mono, monospace",
    },
    genreTag: {
      fontSize: 10, padding: "0px 4px", borderRadius: 0,
      border: "1px solid #00ff4120", color: "#00802080",
      fontFamily: "JetBrains Mono, monospace",
    },
    button: {
      background: "transparent", border: "1px solid #00ff4130", borderRadius: 0,
      padding: "10px 16px", cursor: "pointer", color: "#00ff41",
      textAlign: "left" as const, transition: "all 0.1s",
      fontFamily: "JetBrains Mono, monospace", fontSize: 13,
    },
    buttonActive: {
      background: "#00ff4115", borderColor: "#00ff41",
      boxShadow: "0 0 10px #00ff4120",
    },
    header: {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "12px 24px", borderBottom: "1px solid #00ff4130",
    },
    sectionLabel: {
      fontSize: 12, color: "#00802080", marginBottom: 8,
      textTransform: "uppercase" as const, letterSpacing: "0.2em", fontWeight: 500,
      fontFamily: "JetBrains Mono, monospace",
    },
    statusDot: (c) => ({
      width: 8, height: 8, borderRadius: 0,
      background: c ? "#00ff41" : "#ff0000",
      boxShadow: c ? "0 0 6px #00ff4188" : "0 0 6px #ff000088",
    }),
  },
};

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
  return [series, tag, item.Name].filter(Boolean).join(" \u2014 ");
}

interface Status {
  connected: boolean;
  serverName?: string;
  version?: string;
  error?: string;
}

// ── App ─────────────────────────────────────────────────────────

export default function App() {
  const [dsName, setDsName] = useState<string>("Dark Minimal");
  const ds = systems[dsName];
  const [status, setStatus] = useState<Status | null>(null);
  const [libraries, setLibraries] = useState<JellyfinLibrary[]>([]);
  const [selectedLibrary, setSelectedLibrary] = useState<string | null>(null);
  const [items, setItems] = useState<JellyfinItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

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

  // Load fonts
  useEffect(() => {
    if (!ds.fonts) return;
    const id = "ds-font-" + dsName.replace(/\s/g, "");
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = ds.fonts;
    document.head.appendChild(link);
  }, [dsName, ds.fonts]);

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

  const is90s = dsName === "90s Retro";
  const isBrutal = dsName === "Neo-Brutalism";
  const isTerminal = dsName === "Terminal";

  return (
    <div style={{
      background: ds.colors.bg, color: ds.colors.text, minHeight: "100vh",
      fontFamily: ds.fontFamily, transition: "background 0.3s, color 0.3s",
      ...ds.pageStyle,
    }}>
      {/* Header */}
      <header style={ds.header}>
        <h1 style={{
          margin: 0, fontSize: is90s ? 16 : 24, fontWeight: 800,
          color: is90s ? "#FFFFFF" : isBrutal ? ds.colors.text : ds.colors.accent,
          fontFamily: ds.headingFamily,
          ...(isTerminal ? { letterSpacing: "0.1em" } : {}),
          ...(isBrutal ? { background: "#FF6B6B", padding: "4px 12px", border: "4px solid #000" } : {}),
        }}>
          {isTerminal ? "> virtual-tv" : "Virtual TV"}
        </h1>
        <StatusPill status={status} ds={ds} isTerminal={isTerminal} />
      </header>

      <main style={{ maxWidth: is90s ? 1024 : 1200, margin: "0 auto", padding: is90s ? 16 : 24 }}>
        {/* Design System Picker */}
        <div style={{ marginBottom: is90s ? 16 : 32 }}>
          <div style={ds.sectionLabel}>
            {isTerminal ? "$ select-theme" : "Design System"}
          </div>
          <div style={{ display: "flex", gap: is90s ? 4 : 8, flexWrap: "wrap" }}>
            {Object.keys(systems).map((name) => {
              const s = systems[name];
              const active = dsName === name;
              return (
                <button
                  key={name}
                  onClick={() => setDsName(name)}
                  style={{
                    ...ds.button,
                    ...(active ? ds.buttonActive : {}),
                    display: "flex", alignItems: "center", gap: 8,
                    fontSize: is90s ? 11 : 13,
                  }}
                >
                  <div style={{
                    width: 12, height: 12,
                    borderRadius: name === "Glassmorphism" ? "50%" : (name === "90s Retro" || name === "Neo-Brutalism" || name === "Terminal" ? 0 : 4),
                    background: s.colors.accent,
                    border: isBrutal || is90s ? "2px solid #000" : "none",
                  }} />
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Libraries */}
        <div style={ds.sectionLabel}>
          {isTerminal ? "$ ls /libraries" : "Libraries"}
        </div>
        {libraries.length === 0 && status?.connected && (
          <p style={{ color: ds.colors.textDim }}>No libraries found.</p>
        )}
        {!status?.connected && status !== null && (
          <p style={{ color: "#ef4444" }}>
            {isTerminal ? "ERROR: connection refused" : "Not connected to Jellyfin."}
          </p>
        )}
        <div style={{ display: "flex", gap: is90s ? 4 : 12, marginBottom: is90s ? 16 : 32, flexWrap: "wrap" }}>
          {libraries.map((lib) => {
            const active = selectedLibrary === lib.ItemId;
            return (
              <button
                key={lib.ItemId}
                onClick={() => selectLibrary(lib.ItemId)}
                style={{
                  ...ds.button,
                  ...(active ? ds.buttonActive : {}),
                }}
              >
                <div style={{ fontWeight: is90s ? 700 : 600 }}>{lib.Name}</div>
                <div style={{
                  fontSize: is90s ? 10 : 12,
                  color: active && isBrutal ? "#000" : ds.colors.textDim,
                  marginTop: 2,
                  ...(is90s ? { fontFamily: "Courier New, monospace" } : {}),
                }}>
                  {isTerminal ? `type=${lib.CollectionType}` : lib.CollectionType}
                </div>
              </button>
            );
          })}
        </div>

        {/* Items */}
        {selectedLibrary && (
          <>
            <div style={ds.sectionLabel}>
              {isTerminal
                ? `$ find . -type f | wc -l  # ${totalCount}`
                : <>Items {totalCount > 0 && <span style={{ color: ds.colors.accent }}>({totalCount})</span>}</>
              }
            </div>
            {loading ? (
              <p style={{ color: ds.colors.textDim }}>
                {isTerminal ? "Loading..." : "Loading..."}
              </p>
            ) : (
              <div style={{
                display: "grid",
                gridTemplateColumns: `repeat(auto-fill, minmax(${is90s ? "240px" : "260px"}, 1fr))`,
                gap: is90s ? 0 : 12,
                ...(is90s ? {
                  border: "2px solid #808080",
                } : {}),
              }}>
                {items.map((item, i) => (
                  <div
                    key={item.Id}
                    onMouseEnter={() => setHoveredCard(item.Id)}
                    onMouseLeave={() => setHoveredCard(null)}
                    style={{
                      ...ds.card,
                      ...(hoveredCard === item.Id ? ds.cardHover : {}),
                      ...(is90s ? {
                        borderBottom: "1px solid #808080",
                        borderRight: "1px solid #808080",
                        background: i % 2 === 0 ? "#FFFFFF" : "#E8E8E8",
                        padding: 12,
                        boxShadow: "none",
                      } : {}),
                      ...(isBrutal && hoveredCard === item.Id ? {
                        transform: "translate(-2px, -2px)",
                        boxShadow: "10px 10px 0px 0px #000000",
                      } : {}),
                    }}
                  >
                    <div style={{
                      fontWeight: is90s || isBrutal ? 700 : 600, marginBottom: 4,
                      fontFamily: ds.fontFamily,
                      ...(is90s ? { fontSize: 13, color: "#000000" } : {}),
                      ...(isTerminal ? { fontSize: 13 } : {}),
                    }}>
                      {formatEpisode(item)}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                      <span style={ds.badge}>{item.Type}</span>
                      {item.RunTimeTicks > 0 && (
                        <span style={{
                          fontSize: 12, color: ds.colors.textDim,
                          ...(is90s ? { fontFamily: "Courier New, monospace", fontSize: 11 } : {}),
                        }}>
                          {formatRuntime(item.RunTimeTicks)}
                        </span>
                      )}
                    </div>
                    {item.Genres && item.Genres.length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {item.Genres.slice(0, 4).map((g) => (
                          <span key={g} style={ds.genreTag}>{g}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!selectedLibrary && libraries.length > 0 && (
          <p style={{ color: ds.colors.textDim }}>
            {isTerminal ? "# select a library to list items" : "Select a library to browse its items."}
          </p>
        )}
      </main>
    </div>
  );
}

// ── StatusPill ──────────────────────────────────────────────────

function StatusPill({ status, ds, isTerminal }: {
  status: Status | null; ds: DesignSystem; isTerminal: boolean;
}) {
  if (!status) return <span style={{ color: ds.colors.textDim, fontSize: 13 }}>
    {isTerminal ? "connecting..." : "Checking..."}
  </span>;

  const label = status.connected
    ? (isTerminal ? `ssh ${status.serverName}@jellyfin` : `Connected to ${status.serverName}`)
    : status.error || "Disconnected";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
      <div style={ds.statusDot(status.connected)} />
      <span style={{ color: status.connected ? ds.colors.text : "#ef4444" }}>{label}</span>
    </div>
  );
}
