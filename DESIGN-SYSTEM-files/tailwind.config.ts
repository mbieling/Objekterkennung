import typography from '@tailwindcss/typography';

export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        bbs: {
          orange: {
            50:  '#fff8ed',
            100: '#fff0d4',
            200: '#ffdca8',
            300: '#ffc371',
            400: '#ffa038',
            500: '#f29000',
            600: '#e37800',
            700: '#bc5c02',
            800: '#964808',
            900: '#793c0b',
            DEFAULT: '#f29000',
          },
          blue: {
            50:  '#eef7ff',
            100: '#d9ecff',
            200: '#bcdfff',
            300: '#8eccff',
            400: '#59afff',
            500: '#007cba',
            600: '#006ea6',
            700: '#005a87',
            800: '#004c70',
            900: '#00405e',
            DEFAULT: '#007cba',
          },
          gray: '#222221',
          'gray-light': '#404040',
        },
        background:  'hsl(var(--background))',
        foreground:  'hsl(var(--foreground))',
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input:  'hsl(var(--input))',
        ring:   'hsl(var(--ring))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [typography, require('tailwindcss-animate')],
};
