import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#315EE8',
        ink: '#172033',
        muted: '#64748B',
        bg: '#F7F8FC',
        line: '#E5E7EB',
        success: '#16834A',
        warning: '#B76B12',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(23,32,51,.06), 0 8px 24px rgba(23,32,51,.05)',
      },
    },
  },
  plugins: [],
};

export default config;
