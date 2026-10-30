/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/chatbot/:cell",
        destination: "/c/:cell",
      },
      {
        source: "/cell/:cell",
        destination: "/c/:cell",
      },
    ];
  },
};

export default nextConfig;
