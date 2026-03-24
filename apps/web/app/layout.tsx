import type { Metadata, Viewport } from 'next'
import { Libre_Franklin } from 'next/font/google'
import QueryProvider from '@/providers/QueryProvider'
import { UserProvider } from '@/providers/UserProvider'
import { LanguageProvider } from '@/providers/LanguageProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import './globals.css'

const franklin = Libre_Franklin({
  subsets:  ['latin'],
  variable: '--font-franklin',
  display:  'swap',
  weight:   ['400', '500', '600', '700', '800'],
})

export const metadata: Metadata = {
  title:       'Citizen.Berlin — Berlin Culture Radar',
  description: 'Discover upcoming cultural events across Berlin: exhibitions, music, dance, film, theatre, and more.',
  manifest:    '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Citizen.Berlin' },
  openGraph: {
    title:       'Citizen.Berlin',
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
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('citizen_theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})();if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js')` }} />
        <meta name="impact-site-verification" content="ea3bc18a-81ae-49c3-88f0-ef17f6764dae" />
      </head>
      <body className="bg-[var(--bg-primary)] text-[var(--text-primary)] antialiased font-sans" suppressHydrationWarning>
        <QueryProvider><LanguageProvider><UserProvider><ThemeProvider><ErrorBoundary>{children}</ErrorBoundary></ThemeProvider></UserProvider></LanguageProvider></QueryProvider>
      </body>
    </html>
  )
}
