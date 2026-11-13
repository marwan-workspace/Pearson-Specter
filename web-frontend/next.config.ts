import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  transpilePackages: ['three'],
  async rewrites() {
    const backend = (process.env.BACKEND_URL || 'http://localhost:8000').replace(/\/+$/, '');
    return [{ source: '/backend/:path*', destination: `${backend}/backend/:path*` }];
  },
  // the watch rule set lives in ../watch and is shared with the Python code
  turbopack: { root: path.join(__dirname, '..') },
  // 3D models, the Draco decoder and the wrist-unit page are large and rarely change: let the browser
  // keep them for a day instead of re-downloading on every page (Next's default for public/ is max-age=0).
  async headers() {
    const cache = [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }];
    return ['/models/:path*', '/draco/:path*', '/vitacuff/:path*'].map((source) => ({ source, headers: cache }));
  },
};

export default nextConfig;
