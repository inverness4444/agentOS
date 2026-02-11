import type { Config } from "tailwindcss";
import tailwindAnimate from "tailwindcss-animate";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#F3F4FF",
        surface: "#FFFFFF",
        panel: "#F7F8FF",
        border: "rgba(61, 69, 125, 0.16)",
        accent: "#5B5CEB",
        accentSoft: "#6D7CFF",
        mint: "#30C7B5",
        glow: "rgba(91, 92, 235, 0.2)",
        muted: "rgba(62, 66, 98, 0.65)"
      },
      boxShadow: {
        glow: "0 12px 30px rgba(91, 92, 235, 0.35)",
        soft: "0 20px 60px rgba(78, 86, 142, 0.18)"
      },
      fontFamily: {
        heading: ["var(--font-heading)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"]
      },
      backgroundImage: {
        "radial-glow": "radial-gradient(circle at 15% 20%, rgba(91, 92, 235, 0.14), transparent 45%), radial-gradient(circle at 80% 15%, rgba(109, 124, 255, 0.12), transparent 50%), radial-gradient(circle at 50% 80%, rgba(91, 92, 235, 0.1), transparent 55%)",
        "grid": "linear-gradient(rgba(91, 92, 235, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(91, 92, 235, 0.08) 1px, transparent 1px)"
      }
    }
  },
  plugins: [tailwindAnimate]
};

export default config;
