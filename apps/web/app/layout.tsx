import type { Metadata, Viewport } from 'next'
import { Libre_Franklin } from 'next/font/google'
import QueryProvider from '@/providers/QueryProvider'
import './globals.css'

const franklin = Libre_Franklin({
  subsets:  ['latin'],
  variable: '--font-franklin',
  display:  'swap',
  weight:   ['400', '500', '600', '700', '800'],
})

export const metadata: Metadata = {
  title:       'KulturPulse — Berlin Culture Radar',
  description: 'Discover upcoming cultural events across Berlin: exhibitions, music, dance, film, theatre, and more.',
  manifest:    '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'KulturPulse' },
  openGraph: {
    title:       'KulturPulse',
    description: 'Berlin culture events, live.',
    type:        'website',
  },
}

export const viewport: Viewport = {
  width:            'device-width',
  initialScale:     1,
  themeColor:       '#000000',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={franklin.variable} suppressHydrationWarning>
      <body className="bg-white text-gray-900 antialiased font-sans" suppressHydrationWarning>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  )
}
