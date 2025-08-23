// packages/web/next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {

  async redirects() {
    return [
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'www.use.soap.fyi',
          },
        ],
        destination: 'https://use.soap.fyi/:path*',
        permanent: true, // This sets the status code to 301
      },
    ]
  },
}

export default nextConfig