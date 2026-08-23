import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        base: {
          950: 'var(--color-base-950, #0a0f0d)',
          900: 'var(--color-base-900, #0f1613)',
          800: 'var(--color-base-800, #161f1b)',
          700: 'var(--color-base-700, #212e28)',
          600: 'var(--color-base-600, #324338)',
        },
        signal: {
          500: 'var(--color-signal-500, #5eff9a)',
          600: 'var(--color-signal-600, #3fe07d)',
          400: 'var(--color-signal-400, #8fffbc)',
        },
        amber: {
          500: '#ffb454',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        sans: ['"Inter"', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
  plugins: [],
};
export default config;
