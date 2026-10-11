import type { Metadata, Viewport } from "next";
import { Nav } from "@/components/nav";
import { SessionProvider } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Video Matching Platform",
  description: "대본 작가와 영상 제작자를 연결하는 플랫폼",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>
        <SessionProvider>
          <Nav />
          <main className="container">{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
