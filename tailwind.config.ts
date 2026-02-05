import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#101214',
        fog: '#f6f6f4',
        accent: '#2b7a78',
        edge: '#e4e4e0',
        recording: '#d94a3a'
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Text', 'system-ui', 'sans-serif'],
        display: ['"New York"', 'Times New Roman', 'serif']
      },
      boxShadow: {
        card: '0 16px 40px rgba(0,0,0,0.08)'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}

export default config
