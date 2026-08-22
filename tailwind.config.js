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
          900: '#0F172A',
          800: '#1E293B',
          700: '#334155',
          600: '#475569',
          accent: '#3B82F6',
          amber: '#F59E0B',
          emerald: '#10B981',
          rose: '#EF4444',
          cyan: '#06B6D4'
        }
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.07)',
      }
    },
  },
  plugins: [],
}
