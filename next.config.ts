import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // 사용 기술을 알려주는 X-Powered-By 응답 헤더를 끈다
  poweredByHeader: false,
  // 보안 헤더: 다른 사이트에 끼워 넣기 차단, 파일 형식 추측 차단, 이전 주소 정보 최소화
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
