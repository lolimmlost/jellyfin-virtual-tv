import { useState, useEffect, useMemo } from "react";
import type { JellyfinLibrary, JellyfinItem } from "../shared/types";

// ── Design Systems ──────────────────────────────────────────────

interface ColorTokens {
  bg: string; surface: string; accent: string; secondary: string;
  text: string; textDim: string; border: string; heading: string;
}

interface DesignSystem {
  name: string;
  fonts: string;
  fontFamily: string;
  headingFamily: string;
  defaultDark: boolean;
  colors: ColorTokens;
  darkColors: ColorTokens;
  card: React.CSSProperties;
  cardDark: React.CSSProperties;
  cardHover: React.CSSProperties;
  cardHoverDark: React.CSSProperties;
  listRow: React.CSSProperties;
  listRowDark: React.CSSProperties;
  listRowHover: React.CSSProperties;
  listRowHoverDark: React.CSSProperties;
  badge: React.CSSProperties;
  badgeDark: React.CSSProperties;
  genreTag: React.CSSProperties;
  genreTagDark: React.CSSProperties;
  button: React.CSSProperties;
  buttonDark: React.CSSProperties;
  buttonActive: React.CSSProperties;
  buttonActiveDark: React.CSSProperties;
  header: React.CSSProperties;
  headerDark: React.CSSProperties;
  sectionLabel: React.CSSProperties;
  sectionLabelDark: React.CSSProperties;
  pageStyle: React.CSSProperties;
  pageStyleDark: React.CSSProperties;
  statusDot: (connected: boolean) => React.CSSProperties;
  statusDotDark: (connected: boolean) => React.CSSProperties;
  overlay?: () => React.ReactNode;
  overlayDark?: () => React.ReactNode;
}

// Helper: merge light + dark overrides
function dk<T extends React.CSSProperties>(light: T, dark: Partial<T>, isDark: boolean): React.CSSProperties {
  return isDark ? { ...light, ...dark } : light;
}

const systems: Record<string, DesignSystem> = {

  // ━━ Neo-Brutalism ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "Neo-Brutalism": {
    name: "Neo-Brutalism",
    fonts: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&display=swap",
    fontFamily: "Space Grotesk, sans-serif",
    headingFamily: "Space Grotesk, sans-serif",
    defaultDark: false,
    colors: {
      bg: "#FFFDF5", surface: "#FFFFFF", accent: "#FF6B6B", secondary: "#FFD93D",
      text: "#000000", textDim: "#000000", border: "#000000", heading: "#000000",
    },
    darkColors: {
      bg: "#1a1a1a", surface: "#2a2a2a", accent: "#FF6B6B", secondary: "#FFD93D",
      text: "#f0f0f0", textDim: "#999999", border: "#f0f0f0", heading: "#f0f0f0",
    },
    pageStyle: {
      backgroundImage: "radial-gradient(#00000015 1.5px, transparent 1.5px)",
      backgroundSize: "20px 20px",
    },
    pageStyleDark: {
      backgroundImage: "radial-gradient(#ffffff10 1.5px, transparent 1.5px)",
      backgroundSize: "20px 20px",
    },
    card: {
      background: "#FFFFFF", border: "4px solid #000000", borderRadius: 0,
      boxShadow: "8px 8px 0px 0px #000000", padding: 16,
      transition: "transform 0.1s ease-out, box-shadow 0.1s ease-out",
    },
    cardDark: {
      background: "#2a2a2a", border: "4px solid #f0f0f0",
      boxShadow: "8px 8px 0px 0px #f0f0f0",
    },
    cardHover: { transform: "translate(-2px, -2px)", boxShadow: "10px 10px 0px 0px #000000" },
    cardHoverDark: { transform: "translate(-2px, -2px)", boxShadow: "10px 10px 0px 0px #f0f0f0" },
    listRow: {
      display: "flex", alignItems: "center", gap: 16, padding: "12px 16px",
      background: "#FFFFFF", borderBottom: "4px solid #000000",
      transition: "transform 0.1s ease-out, box-shadow 0.1s ease-out",
    },
    listRowDark: { background: "#2a2a2a", borderBottom: "4px solid #f0f0f0" },
    listRowHover: { background: "#FFD93D" },
    listRowHoverDark: { background: "#FFD93D", color: "#000000" },
    badge: {
      fontSize: 11, padding: "2px 8px", borderRadius: 0, fontWeight: 800,
      background: "#FF6B6B", color: "#000000", border: "2px solid #000000",
      textTransform: "uppercase" as const, letterSpacing: "0.05em",
    },
    badgeDark: { border: "2px solid #f0f0f0" },
    genreTag: {
      fontSize: 11, padding: "1px 6px", borderRadius: 0,
      border: "2px solid #000000", color: "#000000", fontWeight: 700,
    },
    genreTagDark: { border: "2px solid #f0f0f0", color: "#999999" },
    button: {
      background: "#FFD93D", border: "4px solid #000000", borderRadius: 0,
      padding: "12px 20px", cursor: "pointer", color: "#000000", textAlign: "left" as const,
      fontWeight: 800, boxShadow: "4px 4px 0px 0px #000000",
      transition: "transform 0.1s, box-shadow 0.1s", textTransform: "uppercase" as const,
    },
    buttonDark: {
      background: "#FFD93D", border: "4px solid #f0f0f0", color: "#000000",
      boxShadow: "4px 4px 0px 0px #f0f0f0",
    },
    buttonActive: {
      background: "#FF6B6B", boxShadow: "6px 6px 0px 0px #000000",
      transform: "translate(-1px, -1px)",
    },
    buttonActiveDark: {
      background: "#FF6B6B", boxShadow: "6px 6px 0px 0px #f0f0f0",
      transform: "translate(-1px, -1px)",
    },
    header: {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "16px 24px", borderBottom: "4px solid #000000", background: "#FFFDF5",
    },
    headerDark: { borderBottom: "4px solid #f0f0f0", background: "#1a1a1a" },
    sectionLabel: {
      fontSize: 14, color: "#000000", marginBottom: 10, textTransform: "uppercase" as const,
      letterSpacing: "0.15em", fontWeight: 800,
    },
    sectionLabelDark: { color: "#999999" },
    statusDot: (c) => ({
      width: 12, height: 12, borderRadius: 0, border: "2px solid #000",
      background: c ? "#00FF00" : "#FF0000",
    }),
    statusDotDark: (c) => ({
      width: 12, height: 12, borderRadius: 0, border: "2px solid #f0f0f0",
      background: c ? "#00FF00" : "#FF0000",
    }),
  },

  // ━━ 90s Retro ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "90s Retro": {
    name: "90s Retro",
    fonts: "",
    fontFamily: "MS Sans Serif, Tahoma, Geneva, Verdana, sans-serif",
    headingFamily: "Arial Black, Impact, sans-serif",
    defaultDark: false,
    colors: {
      bg: "#C0C0C0", surface: "#FFFFFF", accent: "#0000FF", secondary: "#FFFF00",
      text: "#000000", textDim: "#000000", border: "#808080", heading: "#000080",
    },
    darkColors: {
      bg: "#2a2a3d", surface: "#3a3a50", accent: "#5b8cff", secondary: "#FFFF00",
      text: "#d0d0d0", textDim: "#808090", border: "#50506a", heading: "#8888ff",
    },
    pageStyle: {
      backgroundImage: "linear-gradient(45deg, #b8b8b8 25%, transparent 25%), linear-gradient(-45deg, #b8b8b8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #b8b8b8 75%), linear-gradient(-45deg, transparent 75%, #b8b8b8 75%)",
      backgroundSize: "4px 4px",
      backgroundPosition: "0 0, 0 2px, 2px -2px, -2px 0px",
    },
    pageStyleDark: {
      backgroundImage: "linear-gradient(45deg, #222238 25%, transparent 25%), linear-gradient(-45deg, #222238 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #222238 75%), linear-gradient(-45deg, transparent 75%, #222238 75%)",
      backgroundSize: "4px 4px",
      backgroundPosition: "0 0, 0 2px, 2px -2px, -2px 0px",
    },
    card: {
      background: "#FFFFFF", border: "2px solid", padding: 0, borderRadius: 0,
      borderColor: "#ffffff #808080 #808080 #ffffff",
      boxShadow: "inset -1px -1px 0 #404040, inset 1px 1px 0 #dfdfdf",
    },
    cardDark: {
      background: "#3a3a50", borderColor: "#60607a #1a1a2a #1a1a2a #60607a",
      boxShadow: "inset -1px -1px 0 #0a0a1a, inset 1px 1px 0 #50506a",
    },
    cardHover: {},
    cardHoverDark: {},
    listRow: {
      display: "flex", alignItems: "center", gap: 12, padding: "4px 8px",
      background: "#FFFFFF", borderBottom: "1px solid #808080", fontSize: 12,
    },
    listRowDark: { background: "#3a3a50", borderBottom: "1px solid #50506a" },
    listRowHover: { background: "#000080", color: "#FFFFFF" },
    listRowHoverDark: { background: "#5b8cff", color: "#000000" },
    badge: {
      fontSize: 11, padding: "1px 6px", borderRadius: 0, fontWeight: 700,
      background: "#000080", color: "#FFFFFF", border: "1px solid #000000",
      fontFamily: "Courier New, monospace", textTransform: "uppercase" as const,
    },
    badgeDark: { background: "#5b8cff", color: "#000000", border: "1px solid #50506a" },
    genreTag: {
      fontSize: 10, padding: "0px 4px", borderRadius: 0,
      border: "1px solid #808080", color: "#000000",
      fontFamily: "Courier New, monospace",
    },
    genreTagDark: { border: "1px solid #50506a", color: "#808090" },
    button: {
      background: "#C0C0C0", border: "2px solid", borderRadius: 0,
      borderColor: "#ffffff #808080 #808080 #ffffff",
      boxShadow: "inset -1px -1px 0 #404040, inset 1px 1px 0 #dfdfdf",
      padding: "8px 16px", cursor: "pointer", color: "#000000", textAlign: "left" as const,
      fontWeight: 700, textTransform: "uppercase" as const, fontSize: 12,
    },
    buttonDark: {
      background: "#3a3a50", color: "#d0d0d0",
      borderColor: "#60607a #1a1a2a #1a1a2a #60607a",
      boxShadow: "inset -1px -1px 0 #0a0a1a, inset 1px 1px 0 #50506a",
    },
    buttonActive: {
      background: "#D0D0D0",
      borderColor: "#808080 #ffffff #ffffff #808080",
      boxShadow: "inset 1px 1px 0 #404040, inset -1px -1px 0 #dfdfdf",
    },
    buttonActiveDark: {
      background: "#5b8cff", color: "#000000",
      borderColor: "#1a1a2a #60607a #60607a #1a1a2a",
      boxShadow: "inset 1px 1px 0 #0a0a1a, inset -1px -1px 0 #50506a",
    },
    header: {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "4px 8px",
      background: "linear-gradient(to right, #000080, #1084D0)",
      color: "#FFFFFF", borderBottom: "2px solid #808080",
    },
    headerDark: {
      background: "linear-gradient(to right, #1a1a3d, #2a4a6d)",
      borderBottom: "2px solid #50506a",
    },
    sectionLabel: {
      fontSize: 12, color: "#000080", marginBottom: 8, textTransform: "uppercase" as const,
      letterSpacing: "0.1em", fontWeight: 700,
      fontFamily: "Arial Black, Impact, sans-serif",
    },
    sectionLabelDark: { color: "#8888ff" },
    statusDot: (c) => ({
      width: 8, height: 8, borderRadius: 0,
      background: c ? "#00FF00" : "#FF0000", border: "1px solid #000",
    }),
    statusDotDark: (c) => ({
      width: 8, height: 8, borderRadius: 0,
      background: c ? "#00FF00" : "#FF0000", border: "1px solid #50506a",
    }),
  },

  // ━━ Botanical ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "Botanical": {
    name: "Botanical",
    fonts: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600;1,700&family=Source+Sans+3:wght@400;500;600&display=swap",
    fontFamily: "Source Sans 3, system-ui, sans-serif",
    headingFamily: "Playfair Display, Georgia, serif",
    defaultDark: false,
    colors: {
      bg: "#F9F8F4", surface: "#FFFFFF", accent: "#8C9A84", secondary: "#DCCFC2",
      text: "#2D3A31", textDim: "#7A8578", border: "#E6E2DA", heading: "#2D3A31",
    },
    darkColors: {
      bg: "#1a2118", surface: "#232e22", accent: "#A4B89A", secondary: "#5C4F42",
      text: "#d4ddd0", textDim: "#7A8578", border: "#2f3d2c", heading: "#d4ddd0",
    },
    pageStyle: {},
    pageStyleDark: {},
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
    overlayDark: () => (
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 50, opacity: 0.03,
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
    cardDark: {
      background: "#232e22", border: "1px solid #2f3d2c",
      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.15)",
    },
    cardHover: {
      transform: "translateY(-2px)",
      boxShadow: "0 10px 15px -3px rgba(45, 58, 49, 0.05)",
    },
    cardHoverDark: {
      transform: "translateY(-2px)",
      boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.25)",
    },
    listRow: {
      display: "flex", alignItems: "center", gap: 20, padding: "16px 24px",
      borderBottom: "1px solid #E6E2DA",
      transition: "background 0.3s ease-out",
    },
    listRowDark: { borderBottom: "1px solid #2f3d2c" },
    listRowHover: { background: "#F2F0EB" },
    listRowHoverDark: { background: "#2a3728" },
    badge: {
      fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 600,
      background: "#8C9A8418", color: "#8C9A84",
      border: "1px solid #8C9A8430",
      letterSpacing: "0.03em",
    },
    badgeDark: {
      background: "#A4B89A18", color: "#A4B89A",
      border: "1px solid #A4B89A30",
    },
    genreTag: {
      fontSize: 11, padding: "2px 10px", borderRadius: 20,
      border: "1px solid #E6E2DA", color: "#7A8578",
    },
    genreTagDark: { border: "1px solid #2f3d2c" },
    button: {
      background: "transparent", border: "1px solid #E6E2DA", borderRadius: 9999,
      padding: "12px 24px", cursor: "pointer", color: "#2D3A31",
      textAlign: "left" as const, fontWeight: 500,
      transition: "all 0.3s ease-out",
      letterSpacing: "0.02em",
    },
    buttonDark: { border: "1px solid #2f3d2c", color: "#d4ddd0" },
    buttonActive: {
      background: "#2D3A31", color: "#F9F8F4", borderColor: "#2D3A31",
    },
    buttonActiveDark: {
      background: "#A4B89A", color: "#1a2118", borderColor: "#A4B89A",
    },
    header: {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "20px 32px", borderBottom: "1px solid #E6E2DA", background: "#F9F8F4",
    },
    headerDark: { borderBottom: "1px solid #2f3d2c", background: "#1a2118" },
    sectionLabel: {
      fontSize: 12, color: "#7A8578", marginBottom: 16,
      textTransform: "uppercase" as const, letterSpacing: "0.15em", fontWeight: 500,
    },
    sectionLabelDark: {},
    statusDot: (c) => ({
      width: 8, height: 8, borderRadius: "50%",
      background: c ? "#8C9A84" : "#C27B66",
      boxShadow: c ? "0 0 6px #8C9A8444" : "0 0 6px #C27B6644",
    }),
    statusDotDark: (c) => ({
      width: 8, height: 8, borderRadius: "50%",
      background: c ? "#A4B89A" : "#C27B66",
      boxShadow: c ? "0 0 8px #A4B89A66" : "0 0 8px #C27B6666",
    }),
  },

  // ━━ Vaporwave ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "Vaporwave": {
    name: "Vaporwave",
    fonts: "https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700;900&family=Share+Tech+Mono&display=swap",
    fontFamily: "Share Tech Mono, monospace",
    headingFamily: "Orbitron, sans-serif",
    defaultDark: true,
    colors: {
      bg: "#090014", surface: "rgba(26, 16, 60, 0.8)", accent: "#FF00FF",
      secondary: "#FF9900", text: "#E0E0E0", textDim: "rgba(224,224,224,0.45)",
      border: "#2D1B4E", heading: "#E0E0E0",
    },
    darkColors: {
      bg: "#090014", surface: "rgba(26, 16, 60, 0.8)", accent: "#FF00FF",
      secondary: "#FF9900", text: "#E0E0E0", textDim: "rgba(224,224,224,0.45)",
      border: "#2D1B4E", heading: "#E0E0E0",
    },
    pageStyle: {
      backgroundImage: "radial-gradient(ellipse at 50% 0%, rgba(255,0,255,0.08) 0%, transparent 60%)",
    },
    pageStyleDark: {
      backgroundImage: "radial-gradient(ellipse at 50% 0%, rgba(255,0,255,0.08) 0%, transparent 60%)",
    },
    overlay: () => (
      <>
        <div style={{
          position: "fixed", inset: 0, zIndex: 50, pointerEvents: "none",
          background: "linear-gradient(rgba(18,16,20,0) 50%, rgba(0,0,0,0.25) 50%)",
          backgroundSize: "100% 4px",
        }} />
        <div style={{
          position: "fixed", inset: 0, zIndex: 49, pointerEvents: "none",
          background: "linear-gradient(90deg, rgba(255,0,0,0.03), rgba(0,255,0,0.01), rgba(0,0,255,0.03))",
        }} />
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
    cardDark: {},
    cardHover: {
      transform: "translateY(-2px)",
      boxShadow: "0 0 20px rgba(0,255,255,0.15)",
    },
    cardHoverDark: {},
    listRow: {
      display: "flex", alignItems: "center", gap: 16, padding: "10px 16px",
      borderBottom: "1px solid #2D1B4E",
      background: "rgba(26, 16, 60, 0.4)",
      transition: "all 0.2s linear",
    },
    listRowDark: {},
    listRowHover: {
      background: "rgba(26, 16, 60, 0.8)",
      boxShadow: "inset 2px 0 0 #00FFFF",
    },
    listRowHoverDark: {},
    badge: {
      fontSize: 11, padding: "2px 8px", borderRadius: 0, fontWeight: 700,
      background: "rgba(255,0,255,0.15)", color: "#FF00FF",
      border: "1px solid rgba(255,0,255,0.4)",
      textTransform: "uppercase" as const, letterSpacing: "0.08em",
      fontFamily: "Share Tech Mono, monospace",
    },
    badgeDark: {},
    genreTag: {
      fontSize: 10, padding: "1px 8px", borderRadius: 0,
      border: "1px solid #2D1B4E", color: "rgba(224,224,224,0.45)",
      fontFamily: "Share Tech Mono, monospace",
    },
    genreTagDark: {},
    button: {
      background: "transparent", border: "2px solid #00FFFF", borderRadius: 0,
      padding: "10px 20px", cursor: "pointer", color: "#00FFFF",
      textAlign: "left" as const, fontFamily: "Share Tech Mono, monospace",
      textTransform: "uppercase" as const, letterSpacing: "0.1em", fontSize: 13,
      transition: "all 0.2s linear",
      transform: "skewX(-12deg)",
    },
    buttonDark: {},
    buttonActive: {
      background: "#00FFFF", color: "#090014", borderColor: "#00FFFF",
      boxShadow: "0 0 20px rgba(0,255,255,0.3)",
      transform: "skewX(0deg)",
    },
    buttonActiveDark: {},
    header: {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "16px 24px", borderBottom: "2px solid #2D1B4E",
      background: "rgba(9,0,20,0.9)", backdropFilter: "blur(8px)",
    },
    headerDark: {},
    sectionLabel: {
      fontSize: 12, color: "rgba(224,224,224,0.35)", marginBottom: 12,
      textTransform: "uppercase" as const, letterSpacing: "0.2em", fontWeight: 500,
      fontFamily: "Share Tech Mono, monospace",
    },
    sectionLabelDark: {},
    statusDot: (c) => ({
      width: 8, height: 8, borderRadius: 0,
      background: c ? "#00FFFF" : "#FF00FF",
      boxShadow: c ? "0 0 8px #00FFFF88" : "0 0 8px #FF00FF88",
    }),
    statusDotDark: (c) => ({
      width: 8, height: 8, borderRadius: 0,
      background: c ? "#00FFFF" : "#FF00FF",
      boxShadow: c ? "0 0 8px #00FFFF88" : "0 0 8px #FF00FF88",
    }),
  },

  // ━━ Terminal ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "Terminal": {
    name: "Terminal",
    fonts: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap",
    fontFamily: "JetBrains Mono, monospace",
    headingFamily: "JetBrains Mono, monospace",
    defaultDark: true,
    colors: {
      bg: "#0a0a0a", surface: "#0a0a0a", accent: "#00ff41", secondary: "#00ff41",
      text: "#00ff41", textDim: "#00802080", border: "#00ff4130", heading: "#00ff41",
    },
    darkColors: {
      bg: "#0a0a0a", surface: "#0a0a0a", accent: "#00ff41", secondary: "#00ff41",
      text: "#00ff41", textDim: "#00802080", border: "#00ff4130", heading: "#00ff41",
    },
    pageStyle: {
      backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 20px, #00ff4108 20px, #00ff4108 21px)",
    },
    pageStyleDark: {
      backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 20px, #00ff4108 20px, #00ff4108 21px)",
    },
    card: {
      background: "transparent", border: "1px solid #00ff4130", borderRadius: 0, padding: 16,
      transition: "border-color 0.1s",
    },
    cardDark: {},
    cardHover: { borderColor: "#00ff4160" },
    cardHoverDark: {},
    listRow: {
      display: "flex", alignItems: "center", gap: 12, padding: "6px 0",
      borderBottom: "1px solid #00ff4115",
      transition: "border-color 0.1s",
      fontFamily: "JetBrains Mono, monospace", fontSize: 13,
    },
    listRowDark: {},
    listRowHover: { borderColor: "#00ff4140" },
    listRowHoverDark: {},
    badge: {
      fontSize: 11, padding: "0px 6px", borderRadius: 0, fontWeight: 700,
      background: "#00ff4120", color: "#00ff41", border: "1px solid #00ff4140",
      fontFamily: "JetBrains Mono, monospace",
    },
    badgeDark: {},
    genreTag: {
      fontSize: 10, padding: "0px 4px", borderRadius: 0,
      border: "1px solid #00ff4120", color: "#00802080",
      fontFamily: "JetBrains Mono, monospace",
    },
    genreTagDark: {},
    button: {
      background: "transparent", border: "1px solid #00ff4130", borderRadius: 0,
      padding: "10px 16px", cursor: "pointer", color: "#00ff41",
      textAlign: "left" as const, transition: "all 0.1s",
      fontFamily: "JetBrains Mono, monospace", fontSize: 13,
    },
    buttonDark: {},
    buttonActive: {
      background: "#00ff4115", borderColor: "#00ff41",
      boxShadow: "0 0 10px #00ff4120",
    },
    buttonActiveDark: {},
    header: {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "12px 24px", borderBottom: "1px solid #00ff4130",
    },
    headerDark: {},
    sectionLabel: {
      fontSize: 12, color: "#00802080", marginBottom: 8,
      textTransform: "uppercase" as const, letterSpacing: "0.2em", fontWeight: 500,
      fontFamily: "JetBrains Mono, monospace",
    },
    sectionLabelDark: {},
    statusDot: (c) => ({
      width: 8, height: 8, borderRadius: 0,
      background: c ? "#00ff41" : "#ff0000",
      boxShadow: c ? "0 0 6px #00ff4188" : "0 0 6px #ff000088",
    }),
    statusDotDark: (c) => ({
      width: 8, height: 8, borderRadius: 0,
      background: c ? "#00ff41" : "#ff0000",
      boxShadow: c ? "0 0 6px #00ff4188" : "0 0 6px #ff000088",
    }),
  },
};

// ── SVG Icons ───────────────────────────────────────────────────

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

function SunIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
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
  const [darkMode, setDarkMode] = useState<boolean>(ds.defaultDark);
  const [status, setStatus] = useState<Status | null>(null);
  const [libraries, setLibraries] = useState<JellyfinLibrary[]>([]);
  const [selectedLibrary, setSelectedLibrary] = useState<string | null>(null);
  const [items, setItems] = useState<JellyfinItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // When theme changes, adopt its default dark mode
  useEffect(() => {
    setDarkMode(systems[dsName].defaultDark);
  }, [dsName]);

  // Resolved tokens for current mode
  const colors = darkMode ? ds.darkColors : ds.colors;
  const card = dk(ds.card, ds.cardDark, darkMode);
  const cardHover = dk(ds.cardHover, ds.cardHoverDark, darkMode);
  const listRow = dk(ds.listRow, ds.listRowDark, darkMode);
  const listRowHover = dk(ds.listRowHover, ds.listRowHoverDark, darkMode);
  const badge = dk(ds.badge, ds.badgeDark, darkMode);
  const genreTag = dk(ds.genreTag, ds.genreTagDark, darkMode);
  const button = dk(ds.button, ds.buttonDark, darkMode);
  const buttonActive = dk(ds.buttonActive, ds.buttonActiveDark, darkMode);
  const headerStyle = dk(ds.header, ds.headerDark, darkMode);
  const sectionLabel = dk(ds.sectionLabel, ds.sectionLabelDark, darkMode);
  const pageStyle = dk(ds.pageStyle, ds.pageStyleDark, darkMode);
  const statusDot = darkMode ? ds.statusDotDark : ds.statusDot;
  const overlay = darkMode ? (ds.overlayDark ?? ds.overlay) : ds.overlay;

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
      ...button, padding: "4px 8px", fontSize: 11,
      ...(active ? buttonActive : {}),
    };
    if (isBrutal) return {
      background: active ? "#FF6B6B" : (darkMode ? "#2a2a2a" : "#FFFFFF"),
      border: `3px solid ${darkMode ? "#f0f0f0" : "#000000"}`, borderRadius: 0,
      padding: "6px 8px", cursor: "pointer",
      boxShadow: active ? `3px 3px 0 ${darkMode ? "#f0f0f0" : "#000"}` : "none",
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
    // Botanical
    return {
      background: active ? (darkMode ? "#A4B89A" : "#2D3A31") : "transparent",
      border: `1px solid ${colors.border}`, borderRadius: 8, padding: "6px 10px",
      cursor: "pointer", transition: "all 0.3s ease-out",
      ...(active ? { borderColor: darkMode ? "#A4B89A" : "#2D3A31" } : {}),
    };
  }

  function toggleIconColor(active: boolean): string {
    if (is90s) return darkMode ? (active ? "#000000" : "#d0d0d0") : "#000000";
    if (isBrutal) return darkMode ? "#f0f0f0" : "#000000";
    if (isTerminal) return "#00ff41";
    if (isVaporwave) return active ? "#00FFFF" : "#E0E0E050";
    // Botanical
    if (active) return darkMode ? "#1a2118" : "#F9F8F4";
    return colors.textDim;
  }

  // Dark mode toggle style
  function darkToggleStyle(): React.CSSProperties {
    if (is90s) return {
      ...button, padding: "4px 8px", fontSize: 11, display: "flex", alignItems: "center",
    };
    if (isBrutal) return {
      background: darkMode ? "#FFD93D" : "#2a2a2a",
      border: `3px solid ${darkMode ? "#f0f0f0" : "#000000"}`, borderRadius: 0,
      padding: "6px 8px", cursor: "pointer",
      boxShadow: `2px 2px 0 ${darkMode ? "#f0f0f0" : "#000"}`,
      transition: "transform 0.1s",
    };
    if (isTerminal) return {
      background: "transparent", border: "1px solid #00ff4130",
      borderRadius: 0, padding: "4px 8px", cursor: "pointer",
      fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#00ff41",
    };
    if (isVaporwave) return {
      background: "transparent", border: "1px solid #2D1B4E",
      borderRadius: 0, padding: "5px 8px", cursor: "pointer",
      transition: "all 0.2s linear",
    };
    // Botanical
    return {
      background: "transparent", border: `1px solid ${colors.border}`,
      borderRadius: 9999, padding: "6px 10px", cursor: "pointer",
      transition: "all 0.3s ease-out", display: "flex", alignItems: "center", gap: 6,
    };
  }

  function darkToggleIconColor(): string {
    if (is90s) return darkMode ? "#000000" : "#000000";
    if (isBrutal) return darkMode ? "#000000" : "#f0f0f0";
    if (isTerminal) return "#00ff41";
    if (isVaporwave) return darkMode ? "#FF00FF" : "#00FFFF";
    return colors.textDim;
  }

  return (
    <div style={{
      background: colors.bg, color: colors.text, minHeight: "100vh",
      fontFamily: ds.fontFamily, transition: "background 0.3s, color 0.3s",
      position: "relative",
      ...pageStyle,
    }}>
      {overlay?.()}

      {/* Header */}
      <header style={{ ...headerStyle, position: "relative", zIndex: 10 }}>
        <h1 style={{
          margin: 0,
          fontSize: is90s ? 16 : isBotanical ? 28 : 24,
          fontWeight: isBotanical ? 700 : 800,
          color: is90s ? "#FFFFFF" : isBrutal ? colors.text : isVaporwave ? "#E0E0E0" : colors.accent,
          fontFamily: ds.headingFamily,
          ...(isTerminal ? { letterSpacing: "0.1em" } : {}),
          ...(isBrutal ? {
            background: "#FF6B6B", padding: "4px 12px",
            border: `4px solid ${darkMode ? "#f0f0f0" : "#000"}`, color: "#000000",
          } : {}),
          ...(isBotanical ? { fontStyle: "italic", letterSpacing: "-0.01em" } : {}),
          ...(isVaporwave ? {
            letterSpacing: "0.15em", textTransform: "uppercase" as const,
            fontSize: 20, fontWeight: 900,
            textShadow: "0 0 10px rgba(255,0,255,0.4)",
          } : {}),
        }}>
          {isTerminal ? "> virtual-tv" : "Virtual TV"}
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: is90s ? 8 : 12 }}>
          <StatusPill status={status} colors={colors} ds={ds} isTerminal={isTerminal} isVaporwave={isVaporwave} statusDot={statusDot} />
          <button onClick={() => setDarkMode(!darkMode)} style={darkToggleStyle()} title={darkMode ? "Light mode" : "Dark mode"}>
            {darkMode
              ? <SunIcon color={darkToggleIconColor()} size={is90s ? 14 : 16} />
              : <MoonIcon color={darkToggleIconColor()} size={is90s ? 14 : 16} />
            }
          </button>
        </div>
      </header>

      <main style={{
        maxWidth: is90s ? 1024 : 1200, margin: "0 auto",
        padding: is90s ? 16 : isBotanical ? "32px 32px" : 24,
        position: "relative", zIndex: 10,
      }}>
        {/* Design System Picker */}
        <div style={{ marginBottom: is90s ? 16 : isBotanical ? 40 : 32 }}>
          <div style={sectionLabel}>
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
                    ...button,
                    ...(active ? buttonActive : {}),
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
                        border: isBrutal || is90s ? `2px solid ${darkMode ? "#f0f0f0" : "#000"}` : "none",
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
        <div style={sectionLabel}>
          {isTerminal ? "$ ls /libraries" : isVaporwave ? "> LIBRARIES" : "Libraries"}
        </div>
        {libraries.length === 0 && status?.connected && (
          <p style={{ color: colors.textDim }}>No libraries found.</p>
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
                  ...button,
                  ...(active ? buttonActive : {}),
                }}
              >
                {isVaporwave ? (
                  <span style={{
                    display: "inline-block",
                    transform: active ? "none" : "skewX(12deg)",
                  }}>
                    <div style={{ fontWeight: 700 }}>{lib.Name}</div>
                    <div style={{
                      fontSize: 11, color: active ? "#090014" : colors.textDim, marginTop: 2,
                    }}>
                      {`type=${lib.CollectionType}`}
                    </div>
                  </span>
                ) : (
                  <>
                    <div style={{ fontWeight: is90s ? 700 : isBotanical ? 500 : 600 }}>{lib.Name}</div>
                    <div style={{
                      fontSize: is90s ? 10 : 12,
                      color: active && isBrutal ? (darkMode ? colors.text : "#000") : colors.textDim,
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
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: is90s ? 8 : isBotanical ? 16 : 12,
            }}>
              <div style={{ ...sectionLabel, marginBottom: 0 }}>
                {isTerminal
                  ? `$ find . -type f | wc -l  # ${totalCount}`
                  : isVaporwave
                    ? `> ITEMS [${totalCount}]`
                    : <>Items {totalCount > 0 && <span style={{ color: colors.accent }}>({totalCount})</span>}</>
                }
              </div>
              <div style={{ display: "flex", gap: is90s ? 0 : 4 }}>
                <button onClick={() => setViewMode("grid")} style={toggleBtnStyle(viewMode === "grid")} title="Grid view">
                  <GridIcon color={toggleIconColor(viewMode === "grid")} size={is90s ? 14 : 16} />
                </button>
                <button onClick={() => setViewMode("list")} style={toggleBtnStyle(viewMode === "list")} title="List view">
                  <ListIcon color={toggleIconColor(viewMode === "list")} size={is90s ? 14 : 16} />
                </button>
              </div>
            </div>

            {loading ? (
              <p style={{ color: colors.textDim }}>
                {isVaporwave ? "> LOADING..." : "Loading..."}
              </p>
            ) : viewMode === "grid" ? (
              <div style={{
                display: "grid",
                gridTemplateColumns: `repeat(auto-fill, minmax(${is90s ? "240px" : "260px"}, 1fr))`,
                gap: is90s ? 0 : isBotanical ? 16 : 12,
                ...(is90s ? { border: `2px solid ${colors.border}` } : {}),
              }}>
                {items.map((item, i) => (
                  <div
                    key={item.Id}
                    onMouseEnter={() => setHoveredCard(item.Id)}
                    onMouseLeave={() => setHoveredCard(null)}
                    style={{
                      ...card,
                      ...(hoveredCard === item.Id ? cardHover : {}),
                      ...(is90s ? {
                        borderBottom: `1px solid ${colors.border}`,
                        borderRight: `1px solid ${colors.border}`,
                        background: i % 2 === 0 ? colors.surface : (darkMode ? "#2f2f45" : "#E8E8E8"),
                        padding: 12, boxShadow: "none",
                      } : {}),
                      ...(isBrutal && hoveredCard === item.Id ? {
                        transform: "translate(-2px, -2px)",
                        boxShadow: `10px 10px 0px 0px ${darkMode ? "#f0f0f0" : "#000000"}`,
                      } : {}),
                    }}
                  >
                    <div style={{
                      fontWeight: is90s || isBrutal ? 700 : isBotanical ? 500 : 600,
                      marginBottom: 4,
                      fontFamily: isBotanical ? ds.headingFamily : ds.fontFamily,
                      color: colors.heading,
                      ...(is90s ? { fontSize: 13 } : {}),
                      ...(isTerminal ? { fontSize: 13 } : {}),
                      ...(isBotanical ? { fontSize: 16 } : {}),
                      ...(isVaporwave ? {
                        fontSize: 14, color: "#00FFFF",
                        textShadow: "0 0 5px rgba(0,255,255,0.5)",
                      } : {}),
                    }}>
                      {formatEpisode(item)}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                      <span style={badge}>{item.Type}</span>
                      {item.RunTimeTicks > 0 && (
                        <span style={{
                          fontSize: 12, color: colors.textDim,
                          ...(is90s ? { fontFamily: "Courier New, monospace", fontSize: 11 } : {}),
                        }}>
                          {formatRuntime(item.RunTimeTicks)}
                        </span>
                      )}
                    </div>
                    {item.Genres && item.Genres.length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {item.Genres.slice(0, 4).map((g) => (
                          <span key={g} style={genreTag}>{g}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                ...(is90s ? {
                  border: "2px solid", borderColor: darkMode ? "#60607a #1a1a2a #1a1a2a #60607a" : "#ffffff #808080 #808080 #ffffff",
                  boxShadow: darkMode ? "inset -1px -1px 0 #0a0a1a, inset 1px 1px 0 #50506a" : "inset -1px -1px 0 #404040, inset 1px 1px 0 #dfdfdf",
                } : {}),
                ...(isBrutal ? { border: `4px solid ${darkMode ? "#f0f0f0" : "#000000"}` } : {}),
                ...(isVaporwave ? { border: "1px solid #2D1B4E" } : {}),
                ...(isBotanical ? {
                  background: colors.surface, borderRadius: 24, overflow: "hidden",
                  border: `1px solid ${colors.border}`,
                  boxShadow: darkMode ? "0 4px 6px -1px rgba(0,0,0,0.15)" : "0 4px 6px -1px rgba(45, 58, 49, 0.05)",
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
                        ...listRow,
                        ...(hovered ? listRowHover : {}),
                        ...(is90s ? {
                          background: hovered
                            ? (darkMode ? "#5b8cff" : "#000080")
                            : (i % 2 === 0 ? colors.surface : (darkMode ? "#2f2f45" : "#E8E8E8")),
                          color: hovered ? (darkMode ? "#000000" : "#FFFFFF") : colors.text,
                        } : {}),
                        ...(i === items.length - 1 ? { borderBottom: "none" } : {}),
                      }}
                    >
                      <span style={{
                        ...badge, flexShrink: 0, minWidth: is90s ? 50 : 56,
                        textAlign: "center" as const,
                      }}>
                        {item.Type}
                      </span>
                      <span style={{
                        flex: 1, fontWeight: is90s || isBrutal ? 700 : isBotanical ? 500 : 600,
                        fontFamily: isBotanical ? ds.headingFamily : ds.fontFamily,
                        ...(is90s ? { fontSize: 12 } : {}),
                        ...(isTerminal ? { fontSize: 13 } : {}),
                        ...(isVaporwave ? {
                          color: "#00FFFF",
                          textShadow: hovered ? "0 0 5px rgba(0,255,255,0.5)" : "none",
                        } : {}),
                        ...(isBotanical ? { fontSize: 15, color: colors.heading } : {}),
                      }}>
                        {formatEpisode(item)}
                      </span>
                      {!is90s && item.Genres && item.Genres.length > 0 && (
                        <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          {item.Genres.slice(0, 2).map((g) => (
                            <span key={g} style={genreTag}>{g}</span>
                          ))}
                        </span>
                      )}
                      {item.RunTimeTicks > 0 && (
                        <span style={{
                          fontSize: 12, color: colors.textDim, flexShrink: 0,
                          minWidth: 48, textAlign: "right" as const,
                          ...(is90s && hovered ? { color: darkMode ? "#000000" : "#FFFFFF" } : {}),
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
            color: colors.textDim,
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

function StatusPill({ status, colors, ds, isTerminal, isVaporwave, statusDot }: {
  status: Status | null; colors: ColorTokens; ds: DesignSystem;
  isTerminal: boolean; isVaporwave: boolean;
  statusDot: (connected: boolean) => React.CSSProperties;
}) {
  if (!status) return <span style={{ color: colors.textDim, fontSize: 13 }}>
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
      <div style={statusDot(status.connected)} />
      <span style={{
        color: status.connected ? colors.text : (isVaporwave ? "#FF00FF" : "#ef4444"),
      }}>{label}</span>
    </div>
  );
}
