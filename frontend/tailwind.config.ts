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
        // Material Design 3 tokens (from reference design)
        primary:                    "#006c47",
        "primary-container":        "#37cd8f",
        "primary-fixed":            "#6ffcb9",
        "primary-fixed-dim":        "#4edf9f",
        "on-primary":               "#ffffff",
        "on-primary-container":     "#005235",
        "on-primary-fixed":         "#002113",
        "on-primary-fixed-variant": "#005234",
        "inverse-primary":          "#4edf9f",

        secondary:                  "#555f6f",
        "secondary-container":      "#d6e0f3",
        "secondary-fixed":          "#d9e3f6",
        "secondary-fixed-dim":      "#bdc7d9",
        "on-secondary":             "#ffffff",
        "on-secondary-container":   "#596373",
        "on-secondary-fixed":       "#121c2a",
        "on-secondary-fixed-variant":"#3d4756",

        tertiary:                   "#006591",
        "tertiary-container":       "#56bfff",
        "tertiary-fixed":           "#c9e6ff",
        "tertiary-fixed-dim":       "#89ceff",
        "on-tertiary":              "#ffffff",
        "on-tertiary-container":    "#004c6e",
        "on-tertiary-fixed":        "#001e2f",
        "on-tertiary-fixed-variant":"#004c6e",

        surface:                    "#f8f9ff",
        "surface-dim":              "#cbdbf5",
        "surface-bright":           "#f8f9ff",
        "surface-variant":          "#d3e4fe",
        "surface-tint":             "#006c47",
        "surface-container-lowest": "#ffffff",
        "surface-container-low":    "#eff4ff",
        "surface-container":        "#e5eeff",
        "surface-container-high":   "#dce9ff",
        "surface-container-highest":"#d3e4fe",
        "inverse-surface":          "#213145",
        "inverse-on-surface":       "#eaf1ff",
        "on-surface":               "#0b1c30",
        "on-surface-variant":       "#3c4a41",
        "on-background":            "#0b1c30",
        background:                 "#f8f9ff",

        outline:                    "#6c7a71",
        "outline-variant":          "#bbcabf",

        error:                      "#ba1a1a",
        "error-container":          "#ffdad6",
        "on-error":                 "#ffffff",
        "on-error-container":       "#93000a",

        // Legacy algo tokens (for old components)
        algo: {
          green:  "#34d399",
          dark:   "#09090b",
          card:   "#18181b",
          border: "#27272a",
          text:   "#f4f4f5",
          muted:  "#a1a1aa",
        },
      },
      fontFamily: {
        sans:     ["Inter", "system-ui", "sans-serif"],
        headline: ["Inter", "sans-serif"],
        body:     ["Inter", "sans-serif"],
        label:    ["Inter", "sans-serif"],
        mono:     ["JetBrains Mono", "Consolas", "monospace"],
      },
      boxShadow: {
        "card":    "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        "card-md": "0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)",
        "primary": "0 4px 14px rgba(0,108,71,0.25)",
      },
    },
  },
  plugins: [],
};
export default config;
