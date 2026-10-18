/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // javascript-opentimestamps ships a "main" pointing at a non-existent file; pin its real entry.
    config.resolve.alias['javascript-opentimestamps'] = require('path').resolve(
      __dirname,
      'node_modules/javascript-opentimestamps/index.js',
    );
    return config;
  },
  async headers() {
    return [
      {
        // Apply the security headers to every route.
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "frame-ancestors 'none'",
              "img-src 'self' data: https:",
              "style-src 'self' 'unsafe-inline'",
            ].join('; '),
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
