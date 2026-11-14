import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // the telemetry engine imports ../watch/rules.json and baselines.json, the same files the Python watch reads
  // The report worker can run for 65 seconds, plus remote database reads and writes.
  experimental: { externalDir: true, proxyTimeout: 120_000 },
  turbopack: { root: repoRoot },
  transpilePackages: ['three'],
  async rewrites() {
    const backend = (process.env.BACKEND_URL || 'http://localhost:8000').replace(/\/+$/, '');
    return [{ source: '/backend/:path*', destination: `${backend}/backend/:path*` }];
  },
  // the wrist-unit page ships a large 3D model and three.js: let the browser keep it for a day
  // instead of re-downloading on every visit (Next's default for public/ is max-age=0).
  async headers() {
    return [
      { source: '/vitacuff/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }] },
      // the page and its own code change with the design, so the browser re-checks them (a cheap 304 when unchanged)
      { source: '/:page(vitacuff|vitacuff-v2)/:file(index.html|main.js|style.css)', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ];
  },
};

export default nextConfig;
