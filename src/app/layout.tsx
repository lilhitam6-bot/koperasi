import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import 'leaflet/dist/leaflet.css'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'LendMap PWA',
  description: 'Internal field lending operations workspace',
  manifest: '/manifest.webmanifest',
}

export const viewport: Viewport = {
  themeColor: '#164220',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
