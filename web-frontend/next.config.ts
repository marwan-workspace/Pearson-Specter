import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // the telemetry engine imports ../watch/rules.json and baselines.json, the same files the Python watch reads
  experimental: { externalDir: true },
  transpilePackages: ['three'],
  async rewrites() {
    const backend = (process.env.BACKEND_URL || 'http://localhost:8000').replace(/\/+$/, '');
    return [{ source: '/backend/:path*', destination: `${backend}/backend/:path*` }];
  },
  // the wrist-unit page ships a large 3D model and three.js: let the browser keep it for a day
  // instead of re-downloading on every visit (Next's default for public/ is max-age=0).
  async headers() {
    return [{ source: '/vitacuff/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }] }];
  },
};

export default nextConfig;
