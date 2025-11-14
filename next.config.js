/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // basePathは本番環境でのみ使用（GitHub Pagesなど）
  // 開発環境ではbasePathを無効にするため、環境変数で制御
  basePath: process.env.NODE_ENV === 'production' ? '/OrbisChat' : '',
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;

