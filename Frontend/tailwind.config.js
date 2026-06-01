import tailwindcssRtl from 'tailwindcss-rtl';

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
        'hai-sans': ['Inter Tight', 'Inter', 'SF Pro Display', 'system-ui', '-apple-system', 'sans-serif'],
      },
      backdropBlur: {
        glass: 'var(--glass-blur)',
      },
      // ── Hercules AI briefing design tokens (Plan 1) ──
      // Tokens defined as CSS vars in Frontend/src/Pages/HerculesAI/tokens.css.
      // Exposed here as Tailwind utilities so `bg-hai-surface-100`, `text-hai-text-primary` work.
    },
  },
  plugins: [
    tailwindcssRtl,
    function ({ addUtilities }) {
      // Hercules AI briefing tokens — Tailwind utility wrappers.
      // Reference via e.g. `bg-hai-surface-100`, `text-hai-status-ok-600`, `rounded-hai-lg`.
      addUtilities({
        // Backgrounds
        '.bg-hai-canvas':           { backgroundColor: 'var(--hai-surface-canvas)' },
        '.bg-hai-surface-100':      { backgroundColor: 'var(--hai-surface-100)' },
        '.bg-hai-surface-200':      { backgroundColor: 'var(--hai-surface-200)' },
        '.bg-hai-surface-300':      { backgroundColor: 'var(--hai-surface-300)' },
        '.bg-hai-ok-100':           { backgroundColor: 'var(--hai-status-ok-100)' },
        '.bg-hai-ok-600':           { backgroundColor: 'var(--hai-status-ok-600)' },
        '.bg-hai-warn-100':         { backgroundColor: 'var(--hai-status-warn-100)' },
        '.bg-hai-warn-600':         { backgroundColor: 'var(--hai-status-warn-600)' },
        '.bg-hai-crit-100':         { backgroundColor: 'var(--hai-status-crit-100)' },
        '.bg-hai-crit-600':         { backgroundColor: 'var(--hai-status-crit-600)' },
        '.bg-hai-info-100':         { backgroundColor: 'var(--hai-status-info-100)' },
        '.bg-hai-info-600':         { backgroundColor: 'var(--hai-status-info-600)' },
        '.bg-hai-idle-100':         { backgroundColor: 'var(--hai-status-idle-100)' },
        '.bg-hai-idle-600':         { backgroundColor: 'var(--hai-status-idle-600)' },
        // Text
        '.text-hai-primary':        { color: 'var(--hai-text-primary)' },
        '.text-hai-secondary':      { color: 'var(--hai-text-secondary)' },
        '.text-hai-tertiary':       { color: 'var(--hai-text-tertiary)' },
        '.text-hai-disabled':       { color: 'var(--hai-text-disabled)' },
        '.text-hai-ok':             { color: 'var(--hai-status-ok-600)' },
        '.text-hai-warn':           { color: 'var(--hai-status-warn-600)' },
        '.text-hai-crit':           { color: 'var(--hai-status-crit-600)' },
        '.text-hai-info':           { color: 'var(--hai-status-info-600)' },
        '.text-hai-idle':           { color: 'var(--hai-status-idle-600)' },
        // Borders
        '.border-hai':              { borderColor: 'var(--hai-surface-border)' },
        '.border-hai-strong':       { borderColor: 'var(--hai-surface-border-strong)' },
        '.border-hai-ok':           { borderColor: 'var(--hai-status-ok-600)' },
        '.border-hai-warn':         { borderColor: 'var(--hai-status-warn-600)' },
        '.border-hai-crit':         { borderColor: 'var(--hai-status-crit-600)' },
        // Radius
        '.rounded-hai-sm':          { borderRadius: 'var(--hai-radius-sm)' },
        '.rounded-hai-md':          { borderRadius: 'var(--hai-radius-md)' },
        '.rounded-hai-lg':          { borderRadius: 'var(--hai-radius-lg)' },
        '.rounded-hai-xl':          { borderRadius: 'var(--hai-radius-xl)' },
        '.rounded-hai-2xl':         { borderRadius: 'var(--hai-radius-2xl)' },
        // Elevation
        '.shadow-hai-1':            { boxShadow: 'var(--hai-elev-1)' },
        '.shadow-hai-2':            { boxShadow: 'var(--hai-elev-2)' },
        '.shadow-hai-3':            { boxShadow: 'var(--hai-elev-3)' },
        '.ring-hai-focus':          { boxShadow: 'var(--hai-elev-focus)' },
      });
    },
  ],
};
