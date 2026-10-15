"""GitHub Pages와 같은 방식으로 로컬 미리보기

GitHub Pages 프로젝트 사이트(royalnco.github.io/<repo>/)와 동일하게:
  - basePath(/<repo>)로 정적 빌드(next build, output: export)한 out/ 만 서빙 (서버 기능 없음)
  - /<repo>/ 하위 경로에서만 파일 제공, 그 외 경로는 404.html
  - 디렉터리 요청은 index.html, 슬래시 없는 디렉터리는 슬래시로 리다이렉트

사용: python scripts/preview_pages.py [--base /purchase-dashboard] [--port 8080] [--skip-build]
"""
from __future__ import annotations

import argparse
import functools
import http.server
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"


class PagesHandler(http.server.SimpleHTTPRequestHandler):
    base = "/purchase-dashboard"

    def send_head(self):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        if path in ("", "/"):
            self.send_response(302)
            self.send_header("Location", self.base + "/")
            self.end_headers()
            return None
        if path != self.base and not path.startswith(self.base + "/"):
            return self._not_found()
        self.path = self.path[len(self.base):] or "/"
        if not Path(self.translate_path(self.path)).exists():
            return self._not_found()
        return super().send_head()

    def _not_found(self):
        page = OUT / "404.html"
        body = page.read_bytes() if page.exists() else b"404 Not Found"
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        import io
        return io.BytesIO(body)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")  # Pages 기본 캐시(10분) 대신 미리보기는 즉시 반영
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write(f"[pages] {self.address_string()} {fmt % args}\n")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="/purchase-dashboard", help="저장소 이름 기준 basePath")
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--skip-build", action="store_true")
    args = ap.parse_args()
    base = "/" + args.base.strip("/")

    if not args.skip_build:
        if not (ROOT / "public" / "data" / "secure.json").exists():
            sys.exit("[오류] public/data/secure.json 이 없습니다. 먼저 `python scripts/build_data.py` 를 실행하십시오.")
        print(f"[빌드] BASE_PATH={base} next build (GitHub Actions 와 동일)")
        env = {**os.environ, "BASE_PATH": base}
        subprocess.run("npm run build", cwd=ROOT, env=env, shell=True, check=True)

    for leak in ("purchase.json", "meta.json"):
        if (OUT / "data" / leak).exists():
            sys.exit(f"[오류] 평문 데이터 out/data/{leak} 가 빌드 산출물에 있습니다. 게시 형태가 아닙니다.")

    PagesHandler.base = base
    handler = functools.partial(PagesHandler, directory=str(OUT))
    with http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler) as httpd:
        print(f"[미리보기] http://localhost:{args.port}{base}/  (Ctrl+C 종료)")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
