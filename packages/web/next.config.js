// packages/web/next.config.js

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Your other Next.js configuration can go here.
  // For example: reactStrictMode: true,

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
        permanent: true, // Sets the status code to 301 for SEO
      },
    ];
  },
};

module.exports = nextConfig;