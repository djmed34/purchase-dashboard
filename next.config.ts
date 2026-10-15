import type { NextConfig } from "next";

// GitHub Pages 프로젝트 사이트(royalnco.github.io/<repo>)는 basePath 필요.
// CI에서 BASE_PATH=/<repo> 로 주입하고, 로컬/커스텀 도메인은 빈 값.
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath,
  assetPrefix: basePath || undefined,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
