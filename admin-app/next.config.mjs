/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone admin sub-app. Deployed as a separate Vercel project; the
  // main weuseai.agent landing rewrites /admin/* over to it. Keep this
  // config minimal — no shared deps with the root monorepo.
};

export default nextConfig;
