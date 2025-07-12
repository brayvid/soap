// packages/web/next.config.ts

/** @type {import('next').NextConfig} */
const nextConfig = {
  // This exposes API_INTERNAL_URL to the server-side Next.js bundle
  // allowing server components to use it during build and runtime.
  env: {
    API_INTERNAL_URL: process.env.API_INTERNAL_URL,
  },
};

export default nextConfig;