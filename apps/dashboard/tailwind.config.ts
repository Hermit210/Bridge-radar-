import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* Warm near-black foundation — sophisticated, premium depth */
        bg: "#0a0a09",
        "surface-0": "#121110",
        surface: "#1a1815",
        "surface-2": "#221f1a",
        "surface-3": "#2b2721",
        "surface-4": "#363028",

        border: "#3a352c",
        "border-subtle": "#24211b",
        "border-glow": "rgba(224,165,48,0.14)",

        /* Premium text — warm cream hierarchy with enhanced contrast */
        text: "#f2ede1",
        "text-secondary": "#c7bfae",
        muted: "#948a78",
        "muted-dark": "#695f52",

        /* Cream — used sparingly as a light surface within dark panels
           (e.g. the hero badge), never as a full section background. */
        cream: "#f5f1e8",
        "cream-ink": "#1a1815",

        /* Semantic — refined, professional palette (never re-themed —
           these mean healthy/watch/alert, independent of the accent) */
        green: "#2d9a77",
        "green-glow": "rgba(45,154,119,0.15)",
        yellow: "#c98a3f",
        "yellow-glow": "rgba(201,138,63,0.15)",
        red: "#b84f5e",
        "red-glow": "rgba(184,79,94,0.15)",

        /* Primary accent — vivid warm gold/amber, conveys luxury & trust */
        accent: "#e0a530",
        "accent-glow": "rgba(224,165,48,0.12)",
        "accent-dim": "#c88f25",
        "accent-bright": "#f0bd5c",
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
        serif: [
          "var(--font-serif-accent)",
          "Georgia",
          "serif",
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
        "glow-sm": "0 0 20px -5px rgba(224,165,48,0.16)",
        "glow-md": "0 0 40px -8px rgba(224,165,48,0.20)",
        "glow-lg": "0 0 60px -10px rgba(224,165,48,0.24)",
        "glow-green": "0 0 25px -6px rgba(45,154,119,0.25)",
        "glow-yellow": "0 0 25px -6px rgba(201,138,63,0.25)",
        "glow-red": "0 0 25px -6px rgba(184,79,94,0.25)",
        card: "0 1px 3px rgba(0,0,0,0.5), 0 8px 28px rgba(0,0,0,0.35)",
        "card-hover":
          "0 4px 20px rgba(0,0,0,0.6), 0 0 40px -8px rgba(224,165,48,0.17)",
      },
      animation: {
        "pulse-dot": "pulse-dot 2.5s ease-in-out infinite",
        "fade-in": "fade-in 0.5s ease-out",
        "fade-in-up": "fade-in-up 0.6s ease-out",
        shimmer: "shimmer 2s linear infinite",
        float: "float 8s ease-in-out infinite",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
        "grid-fade": "grid-fade 10s ease-in-out infinite",
        "orbit-slow": "spin 34s linear infinite",
        "orbit-slower": "spin 52s linear infinite",
        marquee: "marquee 28s linear infinite",
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
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
