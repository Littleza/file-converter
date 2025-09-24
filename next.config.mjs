/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // ป้องกัน build error: ffmpeg.wasm ใช้ได้เฉพาะ client
    if (isServer) {
      config.externals.push("@ffmpeg/ffmpeg", "@ffmpeg/core");
    }
    return config;
  },
};

module.exports = nextConfig;
