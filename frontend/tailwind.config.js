/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // Enable dark mode via the .dark class on <html>
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Government of India palette
        navy: {
          50:  '#f0f4ff',
          100: '#e0e9ff',
          500: '#1a4da8',
          600: '#003087',
          700: '#001f5c',
          800: '#001440',
          900: '#000d2e',
        },
        saffron: {
          400: '#FF9933',
          500: '#FF6B00',
          600: '#e05e00',
        },
        india: {
          green: '#138808',
          white: '#FFFFFF',
          saffron: '#FF9933',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
