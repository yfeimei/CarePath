/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Route passes live in server memory; never cache pass-bearing responses at the edge.
  async headers() {
    return [
      {
        source: '/r/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
      },
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
