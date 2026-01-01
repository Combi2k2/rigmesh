import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    esmExternals: 'loose',
  },
  webpack(config, { isServer }) {
    // Allow WASM loading
    config.experiments = {
      ...(config.experiments || {}),
      asyncWebAssembly: true,
    };

    // Prevent client-side fs/path crashes
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        path: false,
      };
    }

    return config;
  },
  turbopack: {}
};

export default nextConfig;
