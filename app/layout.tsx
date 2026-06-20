import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "ARiHA WorkHub | Quản lý Nhiệm vụ & Hiệu suất",
  description: "Hệ thống quản lý nhiệm vụ và đánh giá hiệu suất nhân viên cấp doanh nghiệp",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className="min-h-screen bg-background antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
