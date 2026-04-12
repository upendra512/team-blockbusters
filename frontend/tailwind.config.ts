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
        algo: {
          green: "#00DC82",
          dark: "#0D1117",
          card: "#161B22",
          border: "#30363D",
          text: "#C9D1D9",
          muted: "#8B949E",
        },
      },
    },
  },
  plugins: [],
};
export default config;
