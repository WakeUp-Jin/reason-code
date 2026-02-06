/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 主色调：紫色
        primary: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7e22ce',
          800: '#6b21a8',
          900: '#581c87',
        },
        // 强调色：浅紫色
        accent: {
          light: '#A78BFA', // violet-400
          DEFAULT: '#8B5CF6', // violet-500
          dark: '#7C3AED', // violet-600
        },
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'expand': 'expand 0.3s ease-out forwards',
        'collapse': 'collapse 0.3s ease-out forwards',
      },
      keyframes: {
        expand: {
          '0%': { height: '64px', width: '64px' },
          '100%': { height: '500px', width: '360px' },
        },
        collapse: {
          '0%': { height: '500px', width: '360px' },
          '100%': { height: '64px', width: '64px' },
        },
      },
    },
  },
  plugins: [],
};
