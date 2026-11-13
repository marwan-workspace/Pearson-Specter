import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  transpilePackages: ['three'],
  // the watch rule set lives in ../watch and is shared with the Python code
  turbopack: { root: path.join(__dirname, '..') },
};

export default nextConfig;
