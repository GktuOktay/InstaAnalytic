/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Instrument Sans Variable"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        bg:       'var(--bg)',
        surface:  'var(--surface)',
        surface2: 'var(--surface-2)',
        accent:   'var(--accent)',
        // Eski sınıflardaki `purple-*` artık tek vurgu rengimiz (aşağıdaki kiremit tonları)
        purple: {
          50: '#FFF3EE', 100: '#FFE3D8', 200: '#FFC6B1', 300: '#FFA283', 400: '#F27A52',
          500: '#E8613A', 600: '#D2461F', 700: '#AC3818', 800: '#882E18', 900: '#5E2415', 950: '#3A150C',
        },
      },
    },
  },
  plugins: [],
}
