const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // Next.js ships inline bootstrap/hydration scripts — 'unsafe-inline' is required without a
  // per-request nonce middleware. 'unsafe-eval' covers dev-mode/source-map tooling.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // React's inline `style` prop renders as an HTML style attribute, which CSP treats as inline CSS.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://lh3.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.googleapis.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Only takes effect over HTTPS (browsers ignore it on plain HTTP) — safe to always send.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a self-contained .next/standalone bundle (node_modules pruned to what's actually
  // used) — needed for a lean Docker image instead of shipping the full node_modules tree.
  output: "standalone",
  images: {
    domains: ["firebasestorage.googleapis.com", "lh3.googleusercontent.com"],
  },
  experimental: {
    serverComponentsExternalPackages: ["firebase-admin", "nodemailer", "googleapis"],
  },
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false, child_process: false };
    return config;
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
