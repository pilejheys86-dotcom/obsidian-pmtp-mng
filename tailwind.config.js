/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Primary color adapts to theme via CSS variables (RGB channels for opacity support)
        primary: {
          DEFAULT: "rgb(var(--color-primary-rgb) / <alpha-value>)",
          hover: "rgb(var(--color-primary-hover-rgb) / <alpha-value>)",
          dark: "rgb(var(--color-primary-dark-rgb) / <alpha-value>)",
        },
        "background-light": "#F9F8F6",
        "background-dark": "#0d0d0d",
      },
      fontFamily: {
        // These reference CSS variables from index.css for easy customization
        sans: ["var(--font-sans)"],
        display: ["var(--font-display)"],
      },
      borderRadius: {
        DEFAULT: "var(--radius-md)",
        sm: "var(--radius-sm)",
        lg: "var(--radius-lg)",
        "2xl": "var(--radius-lg)",
        "3xl": "var(--radius-xl)",
      },
      boxShadow: {
        'primary': 'var(--shadow-primary)',
      },
      transitionDuration: {
        fast: 'var(--transition-fast)',
        normal: 'var(--transition-normal)',
        slow: 'var(--transition-slow)',
      },
    },
  },
  plugins: [],
}
