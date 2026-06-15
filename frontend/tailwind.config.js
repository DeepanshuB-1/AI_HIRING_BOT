/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'sans-serif'],
      },
      colors: {
        ink: { DEFAULT: '#0F172A', soft: '#475569', faint: '#94A3B8' },
        canvas: { hr: '#F1F5F9', portal: '#FAFAF7' },
        sidebar: '#1E1B4B',
        brand: { 50: '#EEF2FF', 100: '#E0E7FF', 200: '#C7D2FE', 400: '#818CF8', 500: '#6366F1', 600: '#4F46E5', 700: '#4338CA' },
        port:  { 50: '#F0FDFA', 100: '#CCFBF1', 200: '#99F6E4', 500: '#14B8A6', 600: '#0D9488', 700: '#0F766E' },
        state: {
          pending:   '#94A3B8',
          analyzed:  '#3B82F6',
          review:    '#F59E0B',
          scheduled: '#8B5CF6',
          incall:    '#F97316',
          done:      '#10B981',
          rejected:  '#EF4444',
          failed:    '#64748B',
        },
      },
      borderRadius: {
        card: '14px',
        pill: '999px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(15,23,42,.06), 0 1px 2px rgba(15,23,42,.04)',
        pop:  '0 8px 24px rgba(15,23,42,.12)',
      },
    },
  },
  plugins: [],
}
