"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { reportError } from "@/lib/monitoring";
import { Button } from "@/components/ui/primitives";

export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportError(error, { digest: error.digest, boundary: "site" });
  }, [error]);

  const retry = () =>
    startTransition(() => {
      // re-runs server components too (e.g. a vacancy page whose backend request failed)
      router.refresh();
      reset();
    });

  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-2 text-center">
      <div className="relative mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-inset ring-border">
        <div className="absolute inset-0 -z-10 rounded-2xl bg-rose-500/20 blur-xl" />
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">Что-то пошло не так</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
        Не удалось загрузить страницу. Возможно, сервер временно недоступен — попробуйте ещё раз через минуту.
      </p>
      {error.digest && <p className="mt-2 font-mono text-[11.5px] text-muted-foreground/70">Код ошибки: {error.digest}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button size="lg" onClick={retry}>
          <RefreshCw className="h-4 w-4" /> Повторить
        </Button>
        <Link href="/">
          <Button size="lg" variant="secondary">
            На главную
          </Button>
        </Link>
      </div>
    </div>
  );
}
