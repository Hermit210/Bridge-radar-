import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* Deep navy foundation — sophisticated, premium depth */
        bg: "#0a0e1a",
        "surface-0": "#0f141f",
        surface: "#141a28",
        "surface-2": "#1a2030",
        "surface-3": "#202938",
        "surface-4": "#283244",

        border: "#2a3544",
        "border-subtle": "#1e2634",
        "border-glow": "rgba(212,165,116,0.12)",

        /* Premium text — platinum hierarchy with enhanced contrast */
        text: "#eff1f3",
        "text-secondary": "#b8bcc9",
        muted: "#7f8799",
        "muted-dark": "#5f6678",

        /* Semantic — refined, professional palette */
        green: "#2d9a77",
        "green-glow": "rgba(45,154,119,0.15)",
        yellow: "#c98a3f",
        "yellow-glow": "rgba(201,138,63,0.15)",
        red: "#b84f5e",
        "red-glow": "rgba(184,79,94,0.15)",

        /* Primary accent — rich gold/amber, conveys luxury & trust */
        accent: "#d4a574",
        "accent-glow": "rgba(212,165,116,0.10)",
        "accent-dim": "#c9935f",
        "accent-bright": "#e6bc91",
      },
      fontFamily: {
        display: [
          "var(--font-outfit)",
          "Outfit",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        sans: [
          "var(--font-inter)",
          "Inter",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        mono: [
          "var(--font-jetbrains)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        xs: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.01em" }],
        sm: ["0.8125rem", { lineHeight: "1.25rem", letterSpacing: "0" }],
        base: ["0.9375rem", { lineHeight: "1.5rem", letterSpacing: "-0.01em" }],
        lg: ["1.0625rem", { lineHeight: "1.75rem", letterSpacing: "-0.01em" }],
        xl: ["1.25rem", { lineHeight: "1.875rem", letterSpacing: "-0.02em" }],
        "2xl": ["1.5rem", { lineHeight: "2rem", letterSpacing: "-0.02em" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem", letterSpacing: "-0.03em" }],
        "4xl": ["2.25rem", { lineHeight: "2.5rem", letterSpacing: "-0.03em" }],
        "5xl": ["3rem", { lineHeight: "1.08", letterSpacing: "-0.04em" }],
        "6xl": ["3.75rem", { lineHeight: "1", letterSpacing: "-0.04em" }],
        "7xl": ["4.5rem", { lineHeight: "1", letterSpacing: "-0.05em" }],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      boxShadow: {
        "glow-sm": "0 0 20px -5px rgba(212,165,116,0.14)",
        "glow-md": "0 0 40px -8px rgba(212,165,116,0.18)",
        "glow-lg": "0 0 60px -10px rgba(212,165,116,0.22)",
        "glow-green": "0 0 25px -6px rgba(45,154,119,0.25)",
        "glow-yellow": "0 0 25px -6px rgba(201,138,63,0.25)",
        "glow-red": "0 0 25px -6px rgba(184,79,94,0.25)",
        card: "0 1px 3px rgba(0,0,0,0.5), 0 8px 28px rgba(0,0,0,0.35)",
        "card-hover":
          "0 4px 20px rgba(0,0,0,0.6), 0 0 40px -8px rgba(212,165,116,0.15)",
      },
      animation: {
        "pulse-dot": "pulse-dot 2.5s ease-in-out infinite",
        "fade-in": "fade-in 0.5s ease-out",
        "fade-in-up": "fade-in-up 0.6s ease-out",
        shimmer: "shimmer 2s linear infinite",
        float: "float 8s ease-in-out infinite",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
        "grid-fade": "grid-fade 10s ease-in-out infinite",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.6", transform: "scale(1.3)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.3", transform: "scale(1)" },
          "50%": { opacity: "0.7", transform: "scale(1.3)" },
        },
        "grid-fade": {
          "0%, 100%": { opacity: "0.2" },
          "50%": { opacity: "0.4" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
