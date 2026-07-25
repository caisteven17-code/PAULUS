const { PHASE_PRODUCTION_BUILD } = require('next/constants');

/** @type {import('next').NextConfig} */
const baseConfig = {
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
  turbopack: {},
};

// Production builds use Turbopack (default) — Next 16.2.x has a bug where merely
// defining a `webpack()` config (even unused) corrupts static prerendering of
// internal routes like "_global-error"/"_not-found". So this customization is
// only attached outside the production build phase (i.e. for `next dev --webpack`,
// see package.json's dev script). NODE_ENV can't reliably distinguish build vs dev
// here since the root .env hardcodes NODE_ENV=development, so we use Next's own
// build phase signal instead.
module.exports = (phase: string) => {
  if (phase === PHASE_PRODUCTION_BUILD) {
    return baseConfig;
  }
  return {
    ...baseConfig,
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
};
