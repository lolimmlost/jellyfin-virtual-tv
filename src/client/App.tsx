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
  listRow: React.CSSProperties;
  listRowHover: React.CSSProperties;
  badge: React.CSSProperties;
  genreTag: React.CSSProperties;
  button: React.CSSProperties;
  buttonActive: React.CSSProperties;
  header: React.CSSProperties;
  sectionLabel: React.CSSProperties;
  pageStyle: React.CSSProperties;
  statusDot: (connected: boolean) => React.CSSProperties;
  overlay?: () => React.ReactNode;
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
    listRow: {
      display: "flex", alignItems: "center", gap: 16, padding: "12px 16px",
      background: "#FFFFFF", borderBottom: "4px solid #000000",
      transition: "transform 0.1s ease-out, box-shadow 0.1s ease-out",
    },
    listRowHover: { background: "#FFD93D" },
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
    listRow: {
      display: "flex", alignItems: "center", gap: 12, padding: "4px 8px",
      background: "#FFFFFF", borderBottom: "1px solid #808080", fontSize: 12,
    },
    listRowHover: { background: "#000080", color: "#FFFFFF" },
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

  "Botanical": {
    name: "Botanical",
    fonts: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600;1,700&family=Source+Sans+3:wght@400;500;600&display=swap",
    fontFamily: "Source Sans 3, system-ui, sans-serif",
    headingFamily: "Playfair Display, Georgia, serif",
    colors: {
      bg: "#F9F8F4", surface: "#FFFFFF", accent: "#8C9A84", secondary: "#DCCFC2",
      text: "#2D3A31", textDim: "#7A8578", border: "#E6E2DA", heading: "#2D3A31",
    },
    pageStyle: {},
    overlay: () => (
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 50, opacity: 0.015,
          pointerEvents: "none",
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
        }}
      />
    ),
    card: {
      background: "#FFFFFF", border: "1px solid #E6E2DA", borderRadius: 24, padding: 20,
      boxShadow: "0 4px 6px -1px rgba(45, 58, 49, 0.05)",
      transition: "transform 0.5s ease-out, box-shadow 0.5s ease-out",
    },
    cardHover: {
      transform: "translateY(-2px)",
      boxShadow: "0 10px 15px -3px rgba(45, 58, 49, 0.05)",
    },
    listRow: {
      display: "flex", alignItems: "center", gap: 20, padding: "16px 24px",
      borderBottom: "1px solid #E6E2DA",
      transition: "background 0.3s ease-out",
    },
    listRowHover: { background: "#F2F0EB" },
    badge: {
      fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 600,
      background: "#8C9A8418", color: "#8C9A84",
      border: "1px solid #8C9A8430",
      letterSpacing: "0.03em",
    },
    genreTag: {
      fontSize: 11, padding: "2px 10px", borderRadius: 20,
      border: "1px solid #E6E2DA", color: "#7A8578",
    },
    button: {
      background: "transparent", border: "1px solid #E6E2DA", borderRadius: 9999,
      padding: "12px 24px", cursor: "pointer", color: "#2D3A31",
      textAlign: "left" as const, fontWeight: 500,
      transition: "all 0.3s ease-out",
      letterSpacing: "0.02em",
    },
    buttonActive: {
      background: "#2D3A31", color: "#F9F8F4", borderColor: "#2D3A31",
    },
    header: {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "20px 32px", borderBottom: "1px solid #E6E2DA", background: "#F9F8F4",
    },
    sectionLabel: {
      fontSize: 12, color: "#7A8578", marginBottom: 16,
      textTransform: "uppercase" as const, letterSpacing: "0.15em", fontWeight: 500,
    },
    statusDot: (c) => ({
      width: 8, height: 8, borderRadius: "50%",
      background: c ? "#8C9A84" : "#C27B66",
      boxShadow: c ? "0 0 6px #8C9A8444" : "0 0 6px #C27B6644",
    }),
  },

  "Vaporwave": {
    name: "Vaporwave",
    fonts: "https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700;900&family=Share+Tech+Mono&display=swap",
    fontFamily: "Share Tech Mono, monospace",
    headingFamily: "Orbitron, sans-serif",
    colors: {
      bg: "#090014", surface: "rgba(26, 16, 60, 0.8)", accent: "#FF00FF",
      secondary: "#FF9900", text: "#E0E0E0", textDim: "rgba(224,224,224,0.45)",
      border: "#2D1B4E", heading: "#E0E0E0",
    },
    pageStyle: {
      backgroundImage: "radial-gradient(ellipse at 50% 0%, rgba(255,0,255,0.08) 0%, transparent 60%)",
    },
    overlay: () => (
      <>
        {/* Scanlines */}
        <div style={{
          position: "fixed", inset: 0, zIndex: 50, pointerEvents: "none",
          background: "linear-gradient(rgba(18,16,20,0) 50%, rgba(0,0,0,0.25) 50%)",
          backgroundSize: "100% 4px",
        }} />
        {/* Chromatic aberration */}
        <div style={{
          position: "fixed", inset: 0, zIndex: 49, pointerEvents: "none",
          background: "linear-gradient(90deg, rgba(255,0,0,0.03), rgba(0,255,0,0.01), rgba(0,0,255,0.03))",
        }} />
        {/* Floating sun */}
        <div style={{
          position: "fixed", top: "-200px", left: "50%", transform: "translateX(-50%)",
          width: 600, height: 600, borderRadius: "50%", pointerEvents: "none",
          background: "linear-gradient(to bottom, #FF9900, #FF00FF)",
          filter: "blur(100px)", opacity: 0.15, zIndex: 0,
        }} />
      </>
    ),
    card: {
      background: "rgba(26, 16, 60, 0.8)", border: "1px solid rgba(255,0,255,0.3)",
      borderTop: "2px solid #00FFFF", borderRadius: 0, padding: 16,
      backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      transition: "transform 0.2s linear, box-shadow 0.2s linear",
    },
    cardHover: {
      transform: "translateY(-2px)",
      boxShadow: "0 0 20px rgba(0,255,255,0.15)",
    },
    listRow: {
      display: "flex", alignItems: "center", gap: 16, padding: "10px 16px",
      borderBottom: "1px solid #2D1B4E",
      background: "rgba(26, 16, 60, 0.4)",
      transition: "all 0.2s linear",
    },
    listRowHover: {
      background: "rgba(26, 16, 60, 0.8)",
      boxShadow: "inset 2px 0 0 #00FFFF",
    },
    badge: {
      fontSize: 11, padding: "2px 8px", borderRadius: 0, fontWeight: 700,
      background: "rgba(255,0,255,0.15)", color: "#FF00FF",
      border: "1px solid rgba(255,0,255,0.4)",
      textTransform: "uppercase" as const, letterSpacing: "0.08em",
      fontFamily: "Share Tech Mono, monospace",
    },
    genreTag: {
      fontSize: 10, padding: "1px 8px", borderRadius: 0,
      border: "1px solid #2D1B4E", color: "rgba(224,224,224,0.45)",
      fontFamily: "Share Tech Mono, monospace",
    },
    button: {
      background: "transparent", border: "2px solid #00FFFF", borderRadius: 0,
      padding: "10px 20px", cursor: "pointer", color: "#00FFFF",
      textAlign: "left" as const, fontFamily: "Share Tech Mono, monospace",
      textTransform: "uppercase" as const, letterSpacing: "0.1em", fontSize: 13,
      transition: "all 0.2s linear",
      transform: "skewX(-12deg)",
    },
    buttonActive: {
      background: "#00FFFF", color: "#090014", borderColor: "#00FFFF",
      boxShadow: "0 0 20px rgba(0,255,255,0.3)",
      transform: "skewX(0deg)",
    },
    header: {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "16px 24px", borderBottom: "2px solid #2D1B4E",
      background: "rgba(9,0,20,0.9)", backdropFilter: "blur(8px)",
    },
    sectionLabel: {
      fontSize: 12, color: "rgba(224,224,224,0.35)", marginBottom: 12,
      textTransform: "uppercase" as const, letterSpacing: "0.2em", fontWeight: 500,
      fontFamily: "Share Tech Mono, monospace",
    },
    statusDot: (c) => ({
      width: 8, height: 8, borderRadius: 0,
      background: c ? "#00FFFF" : "#FF00FF",
      boxShadow: c ? "0 0 8px #00FFFF88" : "0 0 8px #FF00FF88",
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
    listRow: {
      display: "flex", alignItems: "center", gap: 12, padding: "6px 0",
      borderBottom: "1px solid #00ff4115",
      transition: "border-color 0.1s",
      fontFamily: "JetBrains Mono, monospace", fontSize: 13,
    },
    listRowHover: { borderColor: "#00ff4140" },
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

// ── SVG Icons (inline, no dependency) ───────────────────────────

function GridIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function ListIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

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
  const [dsName, setDsName] = useState<string>("Botanical");
  const ds = systems[dsName];
  const [status, setStatus] = useState<Status | null>(null);
  const [libraries, setLibraries] = useState<JellyfinLibrary[]>([]);
  const [selectedLibrary, setSelectedLibrary] = useState<string | null>(null);
  const [items, setItems] = useState<JellyfinItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

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
  const isBotanical = dsName === "Botanical";
  const isVaporwave = dsName === "Vaporwave";

  // Theme-aware toggle button style
  function toggleBtnStyle(active: boolean): React.CSSProperties {
    if (is90s) return {
      ...ds.button, padding: "4px 8px", fontSize: 11,
      ...(active ? ds.buttonActive : {}),
    };
    if (isBrutal) return {
      background: active ? "#FF6B6B" : "#FFFFFF",
      border: "3px solid #000000", borderRadius: 0, padding: "6px 8px",
      cursor: "pointer", boxShadow: active ? "3px 3px 0 #000" : "none",
      transition: "transform 0.1s",
    };
    if (isTerminal) return {
      background: active ? "#00ff4115" : "transparent",
      border: active ? "1px solid #00ff41" : "1px solid #00ff4130",
      borderRadius: 0, padding: "4px 8px", cursor: "pointer", color: "#00ff41",
      fontFamily: "JetBrains Mono, monospace", fontSize: 11,
    };
    if (isVaporwave) return {
      background: active ? "rgba(0,255,255,0.15)" : "transparent",
      border: active ? "1px solid #00FFFF" : "1px solid #2D1B4E",
      borderRadius: 0, padding: "5px 8px", cursor: "pointer",
      transition: "all 0.2s linear",
      ...(active ? { boxShadow: "0 0 8px rgba(0,255,255,0.2)" } : {}),
    };
    // Botanical (default)
    return {
      background: active ? "#2D3A31" : "transparent",
      border: "1px solid #E6E2DA", borderRadius: 8, padding: "6px 10px",
      cursor: "pointer", transition: "all 0.3s ease-out",
      ...(active ? { borderColor: "#2D3A31" } : {}),
    };
  }

  function toggleIconColor(active: boolean): string {
    if (is90s) return "#000000";
    if (isBrutal) return "#000000";
    if (isTerminal) return "#00ff41";
    if (isVaporwave) return active ? "#00FFFF" : "#E0E0E050";
    return active ? "#F9F8F4" : "#7A8578";
  }

  return (
    <div style={{
      background: ds.colors.bg, color: ds.colors.text, minHeight: "100vh",
      fontFamily: ds.fontFamily, transition: "background 0.3s, color 0.3s",
      position: "relative",
      ...ds.pageStyle,
    }}>
      {/* Design system overlays (paper grain, scanlines, etc.) */}
      {ds.overlay?.()}

      {/* Header */}
      <header style={{ ...ds.header, position: "relative", zIndex: 10 }}>
        <h1 style={{
          margin: 0,
          fontSize: is90s ? 16 : isBotanical ? 28 : 24,
          fontWeight: isBotanical ? 700 : 800,
          color: is90s ? "#FFFFFF" : isBrutal ? ds.colors.text : isVaporwave ? "#E0E0E0" : ds.colors.accent,
          fontFamily: ds.headingFamily,
          ...(isTerminal ? { letterSpacing: "0.1em" } : {}),
          ...(isBrutal ? { background: "#FF6B6B", padding: "4px 12px", border: "4px solid #000" } : {}),
          ...(isBotanical ? { fontStyle: "italic", letterSpacing: "-0.01em" } : {}),
          ...(isVaporwave ? {
            letterSpacing: "0.15em", textTransform: "uppercase" as const,
            fontSize: 20, fontWeight: 900,
            textShadow: "0 0 10px rgba(255,0,255,0.4)",
          } : {}),
        }}>
          {isTerminal ? "> virtual-tv" : "Virtual TV"}
        </h1>
        <StatusPill status={status} ds={ds} isTerminal={isTerminal} isVaporwave={isVaporwave} />
      </header>

      <main style={{
        maxWidth: is90s ? 1024 : 1200, margin: "0 auto",
        padding: is90s ? 16 : isBotanical ? "32px 32px" : 24,
        position: "relative", zIndex: 10,
      }}>
        {/* Design System Picker */}
        <div style={{ marginBottom: is90s ? 16 : isBotanical ? 40 : 32 }}>
          <div style={ds.sectionLabel}>
            {isTerminal ? "$ select-theme" : isVaporwave ? "> SELECT THEME" : "Design System"}
          </div>
          <div style={{ display: "flex", gap: is90s ? 4 : isBotanical ? 12 : 8, flexWrap: "wrap" }}>
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
                  {isVaporwave ? (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      transform: active ? "none" : "skewX(12deg)",
                    }}>
                      <span style={{
                        width: 10, height: 10, borderRadius: 0,
                        background: s.colors.accent,
                        boxShadow: `0 0 6px ${s.colors.accent}66`,
                      }} />
                      {name}
                    </span>
                  ) : (
                    <>
                      <div style={{
                        width: 12, height: 12,
                        borderRadius: name === "90s Retro" || name === "Neo-Brutalism" || name === "Terminal" || name === "Vaporwave" ? 0 : "50%",
                        background: s.colors.accent,
                        border: isBrutal || is90s ? "2px solid #000" : "none",
                      }} />
                      {name}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Libraries */}
        <div style={ds.sectionLabel}>
          {isTerminal ? "$ ls /libraries" : isVaporwave ? "> LIBRARIES" : "Libraries"}
        </div>
        {libraries.length === 0 && status?.connected && (
          <p style={{ color: ds.colors.textDim }}>No libraries found.</p>
        )}
        {!status?.connected && status !== null && (
          <p style={{ color: isVaporwave ? "#FF00FF" : "#ef4444" }}>
            {isTerminal ? "ERROR: connection refused"
              : isVaporwave ? "> CONNECTION REFUSED" : "Not connected to Jellyfin."}
          </p>
        )}
        <div style={{
          display: "flex", gap: is90s ? 4 : isBotanical ? 16 : 12,
          marginBottom: is90s ? 16 : isBotanical ? 40 : 32, flexWrap: "wrap",
        }}>
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
                {isVaporwave ? (
                  <span style={{
                    display: "inline-block",
                    transform: active ? "none" : "skewX(12deg)",
                  }}>
                    <div style={{ fontWeight: 700 }}>{lib.Name}</div>
                    <div style={{
                      fontSize: 11, color: active ? "#090014" : ds.colors.textDim, marginTop: 2,
                    }}>
                      {`type=${lib.CollectionType}`}
                    </div>
                  </span>
                ) : (
                  <>
                    <div style={{ fontWeight: is90s ? 700 : isBotanical ? 500 : 600 }}>{lib.Name}</div>
                    <div style={{
                      fontSize: is90s ? 10 : 12,
                      color: active && isBrutal ? "#000" : ds.colors.textDim,
                      marginTop: 2,
                      ...(is90s ? { fontFamily: "Courier New, monospace" } : {}),
                      ...(isBotanical ? { fontStyle: "italic" } : {}),
                    }}>
                      {isTerminal ? `type=${lib.CollectionType}` : lib.CollectionType}
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>

        {/* Items */}
        {selectedLibrary && (
          <>
            {/* Section header with view toggle */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: is90s ? 8 : isBotanical ? 16 : 12,
            }}>
              <div style={{ ...ds.sectionLabel, marginBottom: 0 }}>
                {isTerminal
                  ? `$ find . -type f | wc -l  # ${totalCount}`
                  : isVaporwave
                    ? `> ITEMS [${totalCount}]`
                    : <>Items {totalCount > 0 && <span style={{ color: ds.colors.accent }}>({totalCount})</span>}</>
                }
              </div>
              <div style={{ display: "flex", gap: is90s ? 0 : 4 }}>
                <button
                  onClick={() => setViewMode("grid")}
                  style={toggleBtnStyle(viewMode === "grid")}
                  title="Grid view"
                >
                  <GridIcon color={toggleIconColor(viewMode === "grid")} size={is90s ? 14 : 16} />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  style={toggleBtnStyle(viewMode === "list")}
                  title="List view"
                >
                  <ListIcon color={toggleIconColor(viewMode === "list")} size={is90s ? 14 : 16} />
                </button>
              </div>
            </div>

            {loading ? (
              <p style={{ color: ds.colors.textDim }}>
                {isVaporwave ? "> LOADING..." : "Loading..."}
              </p>
            ) : viewMode === "grid" ? (
              /* ── Grid View ─────────────────────────────── */
              <div style={{
                display: "grid",
                gridTemplateColumns: `repeat(auto-fill, minmax(${is90s ? "240px" : "260px"}, 1fr))`,
                gap: is90s ? 0 : isBotanical ? 16 : 12,
                ...(is90s ? { border: "2px solid #808080" } : {}),
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
                        padding: 12, boxShadow: "none",
                      } : {}),
                      ...(isBrutal && hoveredCard === item.Id ? {
                        transform: "translate(-2px, -2px)",
                        boxShadow: "10px 10px 0px 0px #000000",
                      } : {}),
                    }}
                  >
                    <div style={{
                      fontWeight: is90s || isBrutal ? 700 : isBotanical ? 500 : 600,
                      marginBottom: 4,
                      fontFamily: isBotanical ? ds.headingFamily : ds.fontFamily,
                      ...(is90s ? { fontSize: 13, color: "#000000" } : {}),
                      ...(isTerminal ? { fontSize: 13 } : {}),
                      ...(isBotanical ? { fontSize: 16, color: ds.colors.heading } : {}),
                      ...(isVaporwave ? {
                        fontSize: 14, color: "#00FFFF",
                        textShadow: "0 0 5px rgba(0,255,255,0.5)",
                      } : {}),
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
            ) : (
              /* ── List View ─────────────────────────────── */
              <div style={{
                ...(is90s ? {
                  border: "2px solid", borderColor: "#ffffff #808080 #808080 #ffffff",
                  boxShadow: "inset -1px -1px 0 #404040, inset 1px 1px 0 #dfdfdf",
                } : {}),
                ...(isBrutal ? { border: "4px solid #000000" } : {}),
                ...(isVaporwave ? { border: "1px solid #2D1B4E" } : {}),
                ...(isBotanical ? {
                  background: "#FFFFFF", borderRadius: 24, overflow: "hidden",
                  border: "1px solid #E6E2DA",
                  boxShadow: "0 4px 6px -1px rgba(45, 58, 49, 0.05)",
                } : {}),
              }}>
                {items.map((item, i) => {
                  const hovered = hoveredCard === item.Id;
                  return (
                    <div
                      key={item.Id}
                      onMouseEnter={() => setHoveredCard(item.Id)}
                      onMouseLeave={() => setHoveredCard(null)}
                      style={{
                        ...ds.listRow,
                        ...(hovered ? ds.listRowHover : {}),
                        ...(is90s ? {
                          background: hovered ? "#000080" : (i % 2 === 0 ? "#FFFFFF" : "#E8E8E8"),
                          color: hovered ? "#FFFFFF" : "#000000",
                        } : {}),
                        ...(i === items.length - 1 ? { borderBottom: "none" } : {}),
                      }}
                    >
                      {/* Badge */}
                      <span style={{
                        ...ds.badge, flexShrink: 0, minWidth: is90s ? 50 : 56,
                        textAlign: "center" as const,
                      }}>
                        {item.Type}
                      </span>

                      {/* Name */}
                      <span style={{
                        flex: 1, fontWeight: is90s || isBrutal ? 700 : isBotanical ? 500 : 600,
                        fontFamily: isBotanical ? ds.headingFamily : ds.fontFamily,
                        ...(is90s ? { fontSize: 12 } : {}),
                        ...(isTerminal ? { fontSize: 13 } : {}),
                        ...(isVaporwave ? {
                          color: "#00FFFF",
                          textShadow: hovered ? "0 0 5px rgba(0,255,255,0.5)" : "none",
                        } : {}),
                        ...(isBotanical ? { fontSize: 15, color: ds.colors.heading } : {}),
                      }}>
                        {formatEpisode(item)}
                      </span>

                      {/* Genres (hidden on small themes) */}
                      {!is90s && item.Genres && item.Genres.length > 0 && (
                        <span style={{
                          display: "flex", gap: 4, flexShrink: 0,
                        }}>
                          {item.Genres.slice(0, 2).map((g) => (
                            <span key={g} style={ds.genreTag}>{g}</span>
                          ))}
                        </span>
                      )}

                      {/* Runtime */}
                      {item.RunTimeTicks > 0 && (
                        <span style={{
                          fontSize: 12, color: ds.colors.textDim, flexShrink: 0,
                          minWidth: 48, textAlign: "right" as const,
                          ...(is90s && hovered ? { color: "#FFFFFF" } : {}),
                          ...(is90s ? { fontFamily: "Courier New, monospace", fontSize: 11 } : {}),
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
          <p style={{
            color: ds.colors.textDim,
            ...(isBotanical ? { fontStyle: "italic", fontSize: 16 } : {}),
            ...(isVaporwave ? { fontFamily: "Share Tech Mono, monospace" } : {}),
          }}>
            {isTerminal ? "# select a library to list items"
              : isVaporwave ? "> select a library to browse"
              : "Select a library to browse its items."}
          </p>
        )}
      </main>
    </div>
  );
}

// ── StatusPill ──────────────────────────────────────────────────

function StatusPill({ status, ds, isTerminal, isVaporwave }: {
  status: Status | null; ds: DesignSystem; isTerminal: boolean; isVaporwave: boolean;
}) {
  if (!status) return <span style={{ color: ds.colors.textDim, fontSize: 13 }}>
    {isTerminal ? "connecting..." : isVaporwave ? "> CONNECTING..." : "Checking..."}
  </span>;

  const label = status.connected
    ? (isTerminal ? `ssh ${status.serverName}@jellyfin`
      : isVaporwave ? `LINKED // ${status.serverName}`
      : `Connected to ${status.serverName}`)
    : status.error || "Disconnected";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, fontSize: 13,
      ...(isVaporwave ? { fontFamily: "Share Tech Mono, monospace", letterSpacing: "0.05em" } : {}),
    }}>
      <div style={ds.statusDot(status.connected)} />
      <span style={{
        color: status.connected ? ds.colors.text : (isVaporwave ? "#FF00FF" : "#ef4444"),
      }}>{label}</span>
    </div>
  );
}
