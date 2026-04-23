/** @type {import('next').NextConfig} */
// When using optional Base44 (?appId= / NEXT_PUBLIC_BASE44_APP_ID), proxy /api/* to Base44.
// app/api/* route handlers still take precedence.
const base44ApiOrigin = process.env.BASE44_API_ORIGIN || 'https://base44.app'

const nextConfig = {
  async rewrites() {
    return {
      fallback: [
        {
          source: '/api/:path*',
          destination: `${base44ApiOrigin}/api/:path*`,
        },
      ],
    }
  },
}

export default nextConfig