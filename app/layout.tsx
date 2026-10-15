import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "협력사 의존도 대시보드",
  description: "5년간(2021~2025) 매입현황 기반 협력사 의존도·이원화 검토 대시보드",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
