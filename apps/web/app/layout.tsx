import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Video Matching Platform",
  description: "대본 작가와 영상 제작자를 연결하는 플랫폼",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
