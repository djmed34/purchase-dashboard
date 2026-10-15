import type { Metadata } from "next";
import LoginForm from "@/components/login-form";

export const metadata: Metadata = {
  title: "로그인 · 협력사 의존도",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <LoginForm />;
}
