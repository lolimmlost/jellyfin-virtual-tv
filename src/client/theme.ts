// ── Neo-Brutalism Dark ──────────────────────────────────────────

export const c = {
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

export const font = "Space Grotesk, sans-serif";

// ── Styles ───────────────────────────────────────────────────────

export const inputStyle: React.CSSProperties = {
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

export const buttonStyle: React.CSSProperties = {
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

// ── Component CSS ───────────────────────────────────────────────
// Animations the guide components rely on. Injected once by the host app
// (App.tsx here; anything else embedding the components can do the same).

export const componentCss = `
@keyframes vtFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes vtPulseDot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
@keyframes vtShimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.vt-fadein { animation: vtFadeIn 0.22s ease-out both; }
.vt-skeleton-bar {
  background: linear-gradient(90deg, #252525 0%, #333 50%, #252525 100%);
  background-size: 200% 100%;
  animation: vtShimmer 1.4s linear infinite;
}
`;
