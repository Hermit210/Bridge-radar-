import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#030508",
        "surface-0": "#080b10",
        surface: "#0f1216",
        "surface-2": "#151a20",
        "surface-3": "#1a2028",
        "surface-4": "#1e2530",

        border: "#1f242c",
        "border-subtle": "#171c24",
        "border-glow": "rgba(110,168,255,0.15)",

        text: "#e7ecf2",
        "text-secondary": "#b0b8c8",
        muted: "#8a93a4",
        "muted-dark": "#5a6478",

        green: "#2dd4bf",
        "green-glow": "rgba(45,212,191,0.15)",
        yellow: "#facc15",
        "yellow-glow": "rgba(250,204,21,0.15)",
        red: "#fb7185",
        "red-glow": "rgba(251,113,133,0.15)",
        accent: "#6ea8ff",
        "accent-glow": "rgba(110,168,255,0.10)",
        "accent-dim": "#4a7fd4",

        purple: "#a78bfa",
        "purple-dim": "#7c5cbf",
        "purple-glow": "rgba(167,139,250,0.15)",

        "gradient-start": "#6ea8ff",
        "gradient-mid": "#a78bfa",
        "gradient-end": "#2dd4bf",
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
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        "glow-sm": "0 0 15px -3px rgba(110,168,255,0.15)",
        "glow-md": "0 0 30px -5px rgba(110,168,255,0.2)",
        "glow-lg": "0 0 60px -10px rgba(110,168,255,0.25)",
        "glow-purple": "0 0 30px -5px rgba(167,139,250,0.25)",
        "glow-green": "0 0 20px -5px rgba(45,212,191,0.3)",
        "glow-yellow": "0 0 20px -5px rgba(250,204,21,0.3)",
        "glow-red": "0 0 20px -5px rgba(251,113,133,0.3)",
        "inner-glow": "inset 0 1px 0 rgba(255,255,255,0.05)",
        card: "0 1px 3px rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.2)",
        "card-hover":
          "0 4px 30px rgba(0,0,0,0.4), 0 0 40px -10px rgba(110,168,255,0.15)",
      },
      animation: {
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        "fade-in": "fade-in 0.5s ease-out",
        "fade-in-up": "fade-in-up 0.6s ease-out",
        shimmer: "shimmer 2s linear infinite",
        float: "float 6s ease-in-out infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "grid-fade": "grid-fade 8s ease-in-out infinite",
        "gradient-shift": "gradient-shift 6s ease infinite",
        "scale-in": "scale-in 0.5s ease-out",
        "border-glow": "border-glow 3s ease-in-out infinite",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.5", transform: "scale(1.5)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-15px)" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.4", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.4)" },
        },
        "grid-fade": {
          "0%, 100%": { opacity: "0.3" },
          "50%": { opacity: "0.6" },
        },
        "gradient-shift": {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "border-glow": {
          "0%, 100%": { borderColor: "rgba(110,168,255,0.2)" },
          "50%": { borderColor: "rgba(167,139,250,0.4)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
