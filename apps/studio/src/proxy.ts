import { NextResponse, type NextRequest } from "next/server";

/**
 * 베타(BETA_MODE=true)에서는 출연자·캐스팅·흥행 판단 화면을 열지 않는다. API도 그 기능을 올리지 않는다 (docs/launch-readiness.md).
 * 서버 환경 변수라 빌드를 다시 하지 않고 켜고 끌 수 있다.
 */
export function proxy(request: NextRequest) {
  if (process.env.BETA_MODE !== "true") return NextResponse.next();
  return NextResponse.redirect(new URL("/scripts", request.url));
}

export const config = {
  matcher: [
    "/talent/:path*",
    "/talents/:path*",
    "/casting/:path*",
    "/guardian/:path*",
    "/projects/:path*",
    "/works/:path*",
    "/recommendations/:path*",
    "/admin/casting/:path*",
    "/admin/ml/:path*",
  ],
};
