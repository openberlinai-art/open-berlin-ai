import type { NextConfig } from 'next'

const WORKER = process.env.WORKER_API_URL ?? 'http://localhost:8787'

const config: NextConfig = {
  transpilePackages: ['leaflet'],
  reactStrictMode:   true,

  // Proxy /api/* → worker so the browser never needs CORS or public env vars
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${WORKER}/api/:path*` },
    ]
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.kulturdaten.berlin' },
    ],
  },
}

export default config
