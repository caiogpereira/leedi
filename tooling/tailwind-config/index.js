/** @type {import('tailwindcss').Config} */
const config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Leedi neutral gray ramp (12 tones)
        neutral: {
          50: '#f8f8f9',
          100: '#f0f0f2',
          200: '#e2e2e7',
          300: '#c8c8d0',
          400: '#a0a0ab',
          500: '#70707c',
          600: '#52525c',
          700: '#3d3d46',
          800: '#27272f',
          900: '#18181f',
          950: '#0a0a0f',
        },
        // Primary — indigo (10 tones)
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          50: '#eef0ff',
          100: '#dde3ff',
          200: '#c0caff',
          300: '#93a5ff',
          400: '#6675fd',
          500: '#4349f5',
          600: '#342dea',
          700: '#2b23cf',
          800: '#2720a7',
          900: '#252184',
        },
        // AI accent — violet (EXCLUSIVELY for AI badges/indicators)
        'accent-ai': {
          DEFAULT: 'hsl(var(--accent-ai))',
          50: '#f5f0ff',
          100: '#ede3ff',
          200: '#dccaff',
          300: '#c3a3ff',
          400: '#a372ff',
          500: '#8b4eff',
          600: '#7b2df5',
          700: '#6822de',
          800: '#571db8',
          900: '#481a96',
        },
        // WhatsApp — ONLY for channel icon
        whatsapp: {
          DEFAULT: '#25D366',
          dark: '#128C7E',
        },
        // Semantic colors
        success: {
          DEFAULT: 'hsl(var(--success))',
          50: '#f0fdf4',
          500: '#22c55e',
          900: '#14532d',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          50: '#fffbeb',
          500: '#f59e0b',
          900: '#78350f',
        },
        error: {
          DEFAULT: 'hsl(var(--destructive))',
          50: '#fff1f2',
          500: '#ef4444',
          900: '#7f1d1d',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          50: '#eff6ff',
          500: '#3b82f6',
          900: '#1e3a8a',
        },
        // shadcn semantic tokens
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};

module.exports = config;
