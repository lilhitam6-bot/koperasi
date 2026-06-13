import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17211a',
        field: '#f5f0e7',
        moss: '#235a45',
        clay: '#b95738',
        maize: '#e5b94f',
        river: '#276d86',
      },
      boxShadow: {
        line: '0 1px 0 rgba(23, 33, 26, 0.12)',
      },
    },
  },
  plugins: [],
}

export default config
