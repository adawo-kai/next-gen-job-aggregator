import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="text-[56px] font-semibold tracking-tight text-muted-foreground">404</div>
      <h1 className="mt-2 text-xl font-semibold">Страница не найдена</h1>
      <p className="mt-1 text-sm text-muted-foreground">Возможно, ссылка устарела или вакансию сняли с публикации.</p>
      <Link href="/" className="mt-6 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background">
        К вакансиям
      </Link>
    </main>
  );
}
