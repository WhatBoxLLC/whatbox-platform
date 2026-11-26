import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@whatbox/core'],
  output: 'standalone', // small container image for Azure Container Apps
};
export default config;
