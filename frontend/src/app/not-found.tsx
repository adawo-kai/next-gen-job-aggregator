import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Страница не найдена",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="text-[56px] font-semibold tracking-tight text-muted-foreground" aria-hidden>
        404
      </div>
      <h1 className="mt-2 text-xl font-semibold">Страница не найдена</h1>
      <p className="mt-1 text-sm text-muted-foreground">Возможно, ссылка устарела или в адресе опечатка.</p>
      <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-xl bg-foreground px-5 text-[15px] font-medium text-background">
        К вакансиям
      </Link>
    </main>
  );
}
