/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Command-center surface ramp (near-black -> slate)
        base: {
          900: '#05070c',
          850: '#080b12',
          800: '#0b0f18',
          750: '#101623',
          700: '#151d2c',
          650: '#1b2436',
          600: '#232e43',
          500: '#33415c',
        },
        edge: {
          DEFAULT: '#1d2637',
          soft: '#161e2c',
          strong: '#2b384f',
        },
        ink: {
          DEFAULT: '#e6edf7',
          dim: '#9aa8bf',
          faint: '#66738b',
        },
        signal: {
          green: '#22c55e',
          amber: '#f59e0b',
          red: '#ef4444',
        },
        accent: {
          cyan: '#22d3ee',
          blue: '#3b82f6',
          violet: '#8b5cf6',
          teal: '#14b8a6',
        },
        level: {
          low: '#22c55e',
          med: '#eab308',
          high: '#f97316',
          crit: '#ef4444',
        },
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.85rem' }],
        '3xs': ['0.5625rem', { lineHeight: '0.75rem' }],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.8)',
        glow: '0 0 0 1px rgba(34,211,238,0.25), 0 0 22px -6px rgba(34,211,238,0.35)',
        alarm: '0 0 0 1px rgba(239,68,68,0.35), 0 0 26px -6px rgba(239,68,68,0.45)',
      },
      animation: {
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
        'blink-alarm': 'blink-alarm 1s steps(2, start) infinite',
        'slide-in': 'slide-in 220ms ease-out',
        'sweep': 'sweep 2.6s linear infinite',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        'blink-alarm': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.25' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        sweep: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
    },
  },
  plugins: [],
}
