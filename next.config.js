const path = require('path');
const os = require('os');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    instrumentationHook: true,
  },
  webpack: (config, { dev }) => {
    if (dev && config.cache) {
      // When running inside a cloud-synced folder (such as Microsoft OneDrive),
      // background file-sync locks temporary .pack.gz_ files during Webpack's atomic rename,
      // causing [webpack.cache.PackFileCacheStrategy] ENOENT rename errors.
      // Relocating the webpack filesystem cache to a local temp directory outside OneDrive
      // completely eliminates file-lock contention while preserving ultra-fast rebuilds.
      config.cache = {
        type: 'filesystem',
        cacheDirectory: path.join(os.tmpdir(), 'ems-next-webpack-cache'),
      };
    }
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // geolocation=(self): attendance check-in and live tracking need the device location on our own pages
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
