const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NODE_ENV === 'production' ? '.next-build' : '.next',
  env: {
    GOOGLE_MAPS_PLATFORM_KEY: process.env.GOOGLE_MAPS_PLATFORM_KEY,
  },
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  logging: false,
  webpack: (config: any) => {
    const alias = Object.fromEntries(
      Object.entries(config.resolve.alias ?? {}).filter(([, value]) => {
        return (
          typeof value === 'string' ||
          value === false ||
          (Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0))
        );
      }),
    );

    config.resolve.alias = alias;
    return config;
  },
};

module.exports = nextConfig;
