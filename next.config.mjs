/** @type {import('next').NextConfig} */
// When BASE44_API_ORIGIN is explicitly set, proxy unmatched /api/* requests to Base44.
// app/api/* route handlers always take precedence (fallback only fires when no local route matches).
const base44ApiOrigin = process.env.BASE44_API_ORIGIN

const nextConfig = {
  async rewrites() {
    if (!base44ApiOrigin) {
      return { beforeFiles: [], afterFiles: [], fallback: [] }
    }
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