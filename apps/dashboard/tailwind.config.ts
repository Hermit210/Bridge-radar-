import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#07090c",
        surface: "#0f1216",
        border: "#1f242c",
        text: "#e7ecf2",
        muted: "#8a93a4",
        green: "#2dd4bf",
        yellow: "#facc15",
        red: "#fb7185",
        accent: "#6ea8ff",
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
