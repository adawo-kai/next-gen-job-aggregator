import Link from "next/link";

export const LEGAL_EFFECTIVE = "27.11.2026";
export const OPERATOR = "Илим Алишеров";

/** Readable long-form layout shared by the privacy policy and the terms. */
export function LegalPage({ title, intro, toc, children }: { title: string; intro: React.ReactNode; toc: { id: string; title: string }[]; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl pb-6">
      <header className="border-b pb-6">
        <p className="text-[12.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Правовая информация</p>
        <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 text-[13.5px] text-muted-foreground">Редакция от {LEGAL_EFFECTIVE} · действует с {LEGAL_EFFECTIVE}</p>
        <div className="mt-4 text-[15px] leading-relaxed text-foreground/85">{intro}</div>
      </header>
      <nav aria-label="Содержание" className="my-6 rounded-2xl border bg-card/60 p-4 sm:p-5">
        <div className="mb-2 text-[13px] font-semibold">Содержание</div>
        <ol className="grid gap-x-6 gap-y-0.5 text-[13.5px] sm:grid-cols-2">
          {toc.map((t, i) => (
            <li key={t.id}>
              <a href={`#${t.id}`} className="inline-flex min-h-9 items-center text-muted-foreground transition-colors hover:text-foreground">
                {i + 1}. {t.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="legal text-[15px] leading-relaxed text-foreground/85">{children}</div>
      <footer className="mt-10 border-t pt-5 text-[13.5px] text-muted-foreground">
        См. также:{" "}
        <Link href="/privacy" className="text-foreground underline-offset-4 hover:underline">
          Политика конфиденциальности
        </Link>{" "}
        ·{" "}
        <Link href="/terms" className="text-foreground underline-offset-4 hover:underline">
          Пользовательское соглашение
        </Link>
      </footer>
    </article>
  );
}

export function H2({ id, n, children }: { id: string; n: number; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mt-10 scroll-mt-20 text-xl font-semibold tracking-tight text-foreground">
      {n}. {children}
    </h2>
  );
}
