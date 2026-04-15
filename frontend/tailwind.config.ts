import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Keep legacy algo-* tokens mapped to new zinc/emerald palette
        algo: {
          green:  "#34d399", // emerald-400
          dark:   "#09090b", // zinc-950
          card:   "#18181b", // zinc-900
          border: "#27272a", // zinc-800
          text:   "#f4f4f5", // zinc-100
          muted:  "#a1a1aa", // zinc-400
        },
      },
      fontFamily: {
        sans: [
          "Inter", "system-ui", "-apple-system", "BlinkMacSystemFont",
          "Segoe UI", "Roboto", "sans-serif",
        ],
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
