/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async headers() {
    return [
      {
        // Service workers must never be served stale — a cached old sw.js
        // would keep an outdated cache/offline strategy running
        // indefinitely, since the browser only checks for a new sw.js
        // *after* it's allowed to fetch one.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
