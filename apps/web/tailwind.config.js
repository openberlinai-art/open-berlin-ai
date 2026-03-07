/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-franklin)', '"Franklin Gothic Medium"', 'Arial Narrow', 'sans-serif'],
      },
      borderWidth: {
        DEFAULT: '2px',
      },
    },
  },
  plugins: [],
}
