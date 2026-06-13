import type { Metadata, Viewport } from 'next'
import 'leaflet/dist/leaflet.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'LendMap PWA',
  description: 'Internal field lending operations workspace',
  manifest: '/manifest.webmanifest',
}

export const viewport: Viewport = {
  themeColor: '#235a45',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}
