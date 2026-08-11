/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        industrial: {
          900: '#0B0F19',
          800: '#111827',
          700: '#1F2937',
          600: '#374151',
          accent: '#3B82F6',
          amber: '#F59E0B',
          emerald: '#10B981',
          rose: '#EF4444',
          cyan: '#06B6D4'
        }
      }
    },
  },
  plugins: [],
}
