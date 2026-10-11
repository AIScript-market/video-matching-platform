import type { NextConfig } from "next";

// 브라우저는 /api/* 로 같은 출처에 요청하고, Next.js가 API 서버로 넘긴다.
// 덕분에 httpOnly 로그인 쿠키를 CORS 설정 없이 주고받는다.
const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // Playwright 컨테이너가 http://studio:3000 으로 접속할 때 개발 서버 리소스가 막히지 않게 한다
  // 계정별 개발 주소(admin.localhost 등)도 허용
  allowedDevOrigins: ["studio", "*.localhost"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
