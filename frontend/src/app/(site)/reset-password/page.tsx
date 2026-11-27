import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/password-forms";

// the URL carries a one-time secret: never send it to third parties as a referrer
export const metadata: Metadata = { title: "Новый пароль", referrer: "no-referrer" };

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
