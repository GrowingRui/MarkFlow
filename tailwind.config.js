/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.js'],
  theme: {
    extend: {
      colors: {
        navy: '#122B40',
        slate2: '#1E293B',
        teal: '#0E7490',
        sky: '#0EA5E9',
        muted: '#64748B',
        paper: '#F4EFE6',
        desk: '#E8ECF0',
        amber: '#F59E0B',
        rule: '#E3E6EC',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
    },
  },
};
