import type { NextConfig } from "next";

/**
 * Cross-origin isolation is scoped to the terminal lab route only (design §4.11).
 * COOP/COEP would break OAuth redirects, video iframes and third-party scripts
 * everywhere else, so every other route stays non-isolated.
 *
 * Do NOT also add these headers in Amplify's customHttp.yml: a duplicated
 * COEP header ("require-corp, require-corp") fails to parse and silently
 * disables isolation.
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/labs/terminal/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
