import { NextResponse, type NextRequest } from "next/server";

/**
 * 꺼진 기능의 화면은 열지 않는다. API도 그 기능을 올리지 않는다 (apps/api/src/core/beta.ts featureFlags).
 * - 출연자·캐스팅·작품: 당장 하지 않으므로 FEATURE_CASTING=on일 때만
 * - 흥행 판단·추천: 베타(BETA_MODE=true)에서는 끈다
 * 서버 환경 변수라 빌드를 다시 하지 않고 켜고 끌 수 있다.
 */
const CASTING_PATHS = ["/talent", "/talents", "/casting", "/guardian", "/projects", "/works", "/admin/casting"];
const HIT_MODEL_PATHS = ["/recommendations", "/admin/ml"];

const under = (path: string, roots: string[]) => roots.some((r) => path === r || path.startsWith(`${r}/`));

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const hidden =
    (process.env.FEATURE_CASTING !== "on" && under(path, CASTING_PATHS)) || (process.env.BETA_MODE === "true" && under(path, HIT_MODEL_PATHS));
  return hidden ? NextResponse.redirect(new URL("/scripts", request.url)) : NextResponse.next();
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
