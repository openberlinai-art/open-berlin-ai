import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: ['leaflet'],
  reactStrictMode:   true,

  // Make worker URL available server-side (not exposed to browser)
  serverRuntimeConfig: {
    WORKER_API_URL: process.env.WORKER_API_URL ?? 'http://localhost:8787',
  },

  // Public env vars (available in browser bundle)
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787',
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.kulturdaten.berlin' },
    ],
  },
}

export default config
