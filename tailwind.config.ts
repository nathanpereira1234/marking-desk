import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FBFAF6',
        card: '#FFFFFF',
        ink: '#191B1F',
        graphite: '#5C6068',
        rule: '#E4E2DB',
        marker: '#F2B705',
        markerSoft: '#FFF3CD',
        pen: '#CC2936',
        tick: '#146B5A',
        query: '#8A6D1F',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        sheet: '0 1px 2px rgba(25,27,31,.06), 0 12px 28px -18px rgba(25,27,31,.35)',
      },
    },
  },
  plugins: [],
};
export default config;
