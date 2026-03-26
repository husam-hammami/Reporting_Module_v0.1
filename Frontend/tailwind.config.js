/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'selector',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      animation: {
        'fade-loop': 'fadeLoop 0.8s infinite',
        'live-pulse': 'livePulse 2s ease-in-out infinite',
        'glow': 'glowPulse 3s ease-in-out infinite',
        'slide-up': 'slideUp 180ms cubic-bezier(0.4,0,0.2,1)',
      },
      keyframes: {
        fadeLoop: {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '1' },
        },
        livePulse: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.6', transform: 'scale(0.85)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 4px rgba(34, 211, 238, 0.2)' },
          '50%': { boxShadow: '0 0 16px rgba(34, 211, 238, 0.5)' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        brand: {
          DEFAULT: "var(--brand)",
          hover: "var(--brand-hover)",
          subtle: "var(--brand-subtle)",
        },
        'mc-surface': 'var(--surface-elevated)',
        'mc-sunken': 'var(--surface-sunken)',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      backdropBlur: {
        glass: 'var(--glass-blur)',
      },
    },
  },
  plugins: [require('tailwindcss-rtl')],
};
