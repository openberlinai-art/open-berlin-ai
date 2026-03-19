import type { NextConfig } from 'next'

const WORKER = process.env.WORKER_API_URL ?? 'https://citizen-berlin-worker.openberlinai.workers.dev'

const config: NextConfig = {
  transpilePackages: ['maplibre-gl', 'react-map-gl'],
  reactStrictMode:   false,

  // Proxy /api/* → worker so the browser never needs CORS or public env vars
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${WORKER}/api/:path*` },
    ]
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.kulturdaten.berlin' },
      { protocol: 'https', hostname: 'commons.wikimedia.org' },
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
    ],
  },
}

export default config
