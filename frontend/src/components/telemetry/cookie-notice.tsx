"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Cookie, X } from "lucide-react";
import { YM_ID } from "@/lib/analytics";

const KEY = "nja.cookieNotice";

/** Minimal, dismissible notice shown only when Yandex Metrika (cookies) is enabled. */
export function CookieNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!YM_ID) return;
    try {
      if (localStorage.getItem(KEY) !== "1") setShow(true);
    } catch {
      setShow(true);
    }
  }, []);
  if (!show) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    setShow(false);
  };
  return (
    <div
      role="region"
      aria-label="Уведомление о cookie"
      className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-2xl border bg-elevated/95 p-3.5 pr-11 text-[13px] leading-snug text-muted-foreground shadow-2xl shadow-black/25 backdrop-blur md:bottom-5 md:left-5 md:right-auto md:mx-0"
    >
      <div className="flex gap-2.5">
        <Cookie className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" />
        <p>
          Мы используем cookie и Яндекс Метрику, чтобы понимать, как улучшить сайт. Подробнее — в{" "}
          <Link href="/privacy" className="font-medium text-foreground underline underline-offset-2">
            Политике конфиденциальности
          </Link>
          .
        </p>
      </div>
      <button onClick={close} aria-label="Закрыть" className="absolute right-1.5 top-1.5 grid h-10 w-10 cursor-pointer place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
      <button onClick={close} className="mt-2.5 h-9 w-full cursor-pointer rounded-lg bg-foreground text-[13px] font-medium text-background transition hover:bg-foreground/90">
        Понятно
      </button>
    </div>
  );
}
