/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        bg:       '#07070F',
        surface:  '#0E0E1C',
        surface2: '#141425',
        accent:   '#6366F1',
        accent2:  '#8B5CF6',
      },
      boxShadow: {
        glow:    '0 0 20px rgba(99,102,241,0.2)',
        'glow-sm':'0 0 12px rgba(99,102,241,0.15)',
      },
    },
  },
  plugins: [],
}
