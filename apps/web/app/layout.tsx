import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets:  ['latin'],
  variable: '--font-inter',
  display:  'swap',
})

export const metadata: Metadata = {
  title:       'KulturPulse — Berlin Culture Radar',
  description: 'Discover upcoming cultural events across Berlin: exhibitions, music, dance, film, theatre, and more.',
  openGraph: {
    title:       'KulturPulse',
    description: 'Berlin culture events, live.',
    type:        'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-white text-gray-900 antialiased font-sans">
        {children}
      </body>
    </html>
  )
}
