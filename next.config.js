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
};

module.exports = nextConfig;
