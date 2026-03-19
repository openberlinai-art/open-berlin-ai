import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: ['maplibre-gl', 'react-map-gl'],
  reactStrictMode:   false,

  // API proxying is handled by app/api/[...path]/route.ts (explicit header forwarding)
  // No rewrites needed — the catch-all route handler proxies all /api/* to the worker

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.kulturdaten.berlin' },
      { protocol: 'https', hostname: 'commons.wikimedia.org' },
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
    ],
  },
}

export default config
