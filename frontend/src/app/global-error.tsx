"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/monitoring";

/* Last-resort boundary (errors in the root layout itself). Must render its own <html>/<body> and cannot
   rely on the app's CSS being loaded, hence inline styles. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, { digest: error.digest, boundary: "global" });
  }, [error]);

  return (
    <html lang="ru">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#07070a", color: "#ededf0", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 40, lineHeight: 1 }} aria-hidden>
            ⚠︎
          </div>
          <h1 style={{ fontSize: 22, margin: "16px 0 8px", fontWeight: 600 }}>JobRadar временно недоступен</h1>
          <p style={{ margin: 0, color: "#8b8b98", fontSize: 15, lineHeight: 1.55 }}>Мы уже знаем о проблеме. Попробуйте обновить страницу через минуту.</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 24 }}>
            <button
              onClick={() => reset()}
              style={{ height: 44, padding: "0 20px", borderRadius: 12, border: 0, background: "#ededf0", color: "#07070a", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
            >
              Повторить
            </button>
            <a href="/" style={{ height: 44, padding: "0 20px", borderRadius: 12, background: "#121218", color: "#ededf0", fontSize: 15, fontWeight: 500, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
              На главную
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
