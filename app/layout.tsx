/**
 * RootLayout - アプリケーションのルートレイアウトコンポーネント
 * 
 * このファイルは、Next.jsアプリケーションのルートレイアウトを定義しています。
 * 全ページ共通のHTML構造、メタデータ設定、グローバルスタイルの読み込みを
 * 担当し、アプリケーション全体の基本構造を提供します。
 */

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OrbisChat",
  description: "Multi-persona chat room with LangGraph",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

