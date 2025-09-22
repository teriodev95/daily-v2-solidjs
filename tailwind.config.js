/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'ios-gray': {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
        },
        'ios-blue': {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#007AFF',
          600: '#0051D5',
          700: '#003A8C',
          800: '#002E6E',
          900: '#001E4A',
        },
        'ios-green': {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#34C759',
          600: '#28A745',
          700: '#1E7E34',
          800: '#166534',
          900: '#14532d',
        }
      },
      fontFamily: {
        'system': ['-apple-system', 'BlinkMacSystemFont', 'San Francisco', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        'ios': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
        'ios-md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
        'ios-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
        'ios-inner': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',
      },
      borderRadius: {
        'ios': '0.75rem',
        'ios-sm': '0.5rem',
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('daisyui'),
  ],
  daisyui: {
    themes: [
      {
        ios: {
          "primary": "#000000",
          "secondary": "#525252",
          "accent": "#404040",
          "neutral": "#f5f5f5",
          "base-100": "#ffffff",
          "base-200": "#fafafa",
          "base-300": "#e5e5e5",
          "info": "#737373",
          "success": "#404040",
          "warning": "#525252",
          "error": "#171717",
        },
      },
    ],
    base: false,
    styled: true,
    utils: true,
  },
} 