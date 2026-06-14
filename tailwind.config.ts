import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1b1c1a',
        field: '#fbf9f5',
        paper: '#ffffff',
        surface: '#fbf9f5',
        'surface-low': '#f5f3ef',
        'surface-container': '#efeeea',
        'surface-high': '#eae8e4',
        outline: '#c1c9be',
        moss: '#2e5a35',
        clay: '#ba1a1a',
        maize: '#d9a441',
        river: '#32647f',
        primary: '#164220',
        secondary: '#32647f',
        tertiary: '#6c4b00',
      },
      boxShadow: {
        line: '0 1px 0 rgba(27, 28, 26, 0.08)',
        dock: '0 -1px 0 rgba(27, 28, 26, 0.12)',
      },
    },
  },
  plugins: [],
}

export default config
