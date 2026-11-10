import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

// Colors point at the spreadsheet tokens in app/spreadsheet.css, which are
// already colors (not bare HSL channels), so utilities do not wrap them in hsl().
const config: Config = {
  darkMode: ["class"],
  corePlugins: { preflight: false },
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--primary)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
        secondary: { DEFAULT: "var(--muted)", foreground: "var(--foreground)" },
        destructive: { DEFAULT: "var(--destructive)", foreground: "#ffffff" },
        muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        accent: { DEFAULT: "var(--accent)", foreground: "var(--foreground)" },
        popover: { DEFAULT: "#ffffff", foreground: "var(--foreground)" },
        card: { DEFAULT: "var(--card)", foreground: "var(--foreground)" },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [animate],
};

export default config;
