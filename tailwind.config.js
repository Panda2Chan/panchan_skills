/** @type {import('tailwindcss').Config} */
export default {
  content: ["./web/index.html", "./web/src/**/*.{js,jsx}"],
  theme: {
    extend: {
      boxShadow: {
        pixel: "6px 6px 0 #1f2937",
        "pixel-sm": "3px 3px 0 #1f2937",
      },
      fontFamily: {
        display: ["Trebuchet MS", "ui-rounded", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

