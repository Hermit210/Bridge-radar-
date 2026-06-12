import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* Deep navy base — warm enough to not feel dead */
        bg: "#0a0e17",
        "surface-0": "#0f1420",
        surface: "#141a26",
        "surface-2": "#1a2133",
        "surface-3": "#212940",
        "surface-4": "#283350",

        border: "#1e2740",
        "border-subtle": "#161d30",
        "border-glow": "rgba(99,135,210,0.12)",

        /* Text — warm-tinted whites, never pure white */
        text: "#e1e6f0",
        "text-secondary": "#97a3bd",
        muted: "#6b7a96",
        "muted-dark": "#475470",

        /* Semantic — desaturated, professional */
        green: "#3ec99d",
        "green-glow": "rgba(62,201,157,0.12)",
        yellow: "#e5b94e",
        "yellow-glow": "rgba(229,185,78,0.12)",
        red: "#e5697b",
        "red-glow": "rgba(229,105,123,0.12)",

        /* Primary accent — one confident blue */
        accent: "#6387d2",
        "accent-glow": "rgba(99,135,210,0.08)",
        "accent-dim": "#4e6db3",
        "accent-bright": "#7ea0e8",
      },
      fontFamily: {
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
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      boxShadow: {
        "glow-sm": "0 0 20px -5px rgba(99,135,210,0.12)",
        "glow-md": "0 0 40px -8px rgba(99,135,210,0.15)",
        "glow-lg": "0 0 60px -10px rgba(99,135,210,0.18)",
        "glow-green": "0 0 25px -6px rgba(62,201,157,0.2)",
        "glow-yellow": "0 0 25px -6px rgba(229,185,78,0.2)",
        "glow-red": "0 0 25px -6px rgba(229,105,123,0.2)",
        card: "0 1px 3px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.25)",
        "card-hover":
          "0 4px 16px rgba(0,0,0,0.5), 0 0 30px -8px rgba(99,135,210,0.1)",
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
