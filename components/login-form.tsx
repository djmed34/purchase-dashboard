"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "./ui";
import { AuthError, fetchBundle, getSession, login } from "@/lib/secure";

export default function LoginForm() {
  const router = useRouter();
  const [id, setId] = React.useState("");
  const [pw, setPw] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    // 이미 로그인했거나 평문(개발) 모드면 대시보드로
    if (getSession()) {
      router.replace("/");
      return;
    }
    fetchBundle()
      .then((b) => {
        if (!b) router.replace("/");
      })
      .catch(() => setError("데이터 파일을 불러오지 못했습니다. 배포 상태를 확인하십시오."));
    try {
      if (new URLSearchParams(window.location.search).get("expired")) {
        setNotice("세션이 만료되었거나 데이터가 갱신되었습니다. 다시 로그인하십시오.");
      }
    } catch {
      /* noop */
    }
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !pw) {
      setError("아이디와 비밀번호를 입력하십시오.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(id, pw);
      router.replace("/");
    } catch (err) {
      setError(err instanceof AuthError ? "아이디 또는 비밀번호가 올바르지 않습니다." : "로그인 중 오류가 발생했습니다.");
      setPw("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6">
          <div className="mb-3 inline-flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold">협력사 의존도 대시보드</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            사내 기밀 정보입니다. 승인된 사용자만 로그인할 수 있습니다.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <label htmlFor="uid" className="text-[13px] font-medium">
              아이디
            </label>
            <input
              id="uid"
              autoComplete="username"
              autoFocus
              value={id}
              onChange={(e) => setId(e.target.value)}
              className="h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="pw" className="text-[13px] font-medium">
              비밀번호
            </label>
            <input
              id="pw"
              type="password"
              autoComplete="current-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {(error || notice) && (
            <p role="alert" className={error ? "text-[13px] text-delta-down" : "text-[13px] text-muted-foreground"}>
              {error ?? notice}
            </p>
          )}

          <Button type="submit" className="h-10 w-full" disabled={busy}>
            {busy ? "확인 중…" : "로그인"}
          </Button>
        </form>

        <p className="mt-6 border-t pt-4 text-[11px] leading-relaxed text-muted-foreground">
          계정 발급·비밀번호 변경은 전략소싱 담당자에게 요청하십시오. 로그인 정보는 이 브라우저 탭에서만 유지되며 8시간 후
          만료됩니다.
        </p>
      </Card>
    </div>
  );
}
