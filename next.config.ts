import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    instantInsights: {
      // Only pages that export `instant` are checked. The admin area renders in
      // the browser after a session check, so its pages never show up in a
      // server render and validating them only reports "dropped segment".
      validationLevel: 'manual-warning',
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
