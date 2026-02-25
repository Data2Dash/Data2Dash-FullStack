/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        sage: {
          50: '#f2f7f4',
          100: '#e0ede6',
          200: '#c2dbcc',
          300: '#97c0a9',
          400: '#659e81',
          500: '#4a8463',
          600: '#38694e',
          700: '#2d5440',
          800: '#264436',
          900: '#20392d',
        },
        stone: {
          50: '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
          950: '#0c0a09',
        },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        'soft': '0 2px 8px 0 rgba(0,0,0,0.06)',
        'card': '0 4px 24px 0 rgba(0,0,0,0.07)',
        'panel': '0 8px 40px 0 rgba(0,0,0,0.10)',
      },
    },
  },
  plugins: [],
}