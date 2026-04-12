/**
 * Design tokens — ported from recomp web globals.css
 * Earth-tone palette: cream, olive, beige, charcoal
 */
export const colors = {
  background: "#faf8f5",
  foreground: "#3d3730",
  accent: "#6b7c3c",
  accentHover: "#5a6b2e",
  muted: "#9a9389",
  mutedForeground: "#6b6358",
  surface: "#f5f1ec",
  surfaceElevated: "#efebe5",
  border: "#e0d9d0",
  borderSoft: "#ebe6df",
  inputBg: "#ffffff",
  cardBg: "#ffffff",
  accentSage: "#7d8c4a",
  accentWarm: "#b8956b",
  accentTerracotta: "#9b7b6c",
  accent10: "rgba(107, 124, 60, 0.08)",
  accent20: "rgba(107, 124, 60, 0.15)",
} as const;

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const fontSize = {
  caption: 11,
  small: 13,
  body: 15,
  bodyLg: 17,
  h6: 17,
  h5: 19,
  h4: 22,
  h3: 26,
  h2: 30,
  h1: 36,
} as const;

export const fontWeight = {
  normal: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  full: 9999,
} as const;

export const lineHeight = {
  caption: 16,
  small: 20,
  body: 22,
} as const;

export const shadow = {
  soft: {
    shadowColor: "#3d3730",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  medium: {
    shadowColor: "#3d3730",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
} as const;
