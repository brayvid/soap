// packages/web/next.config.ts
/** @type {import('next').NextConfig} */
const nextConfig = {

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

module.exports = nextConfig