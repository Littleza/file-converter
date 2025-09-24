/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true, // ปิด eslint error ตอน build
  },
  experimental: {
    esmExternals: 'loose', // กัน error ffmpeg.wasm
  },
};

export default nextConfig;
