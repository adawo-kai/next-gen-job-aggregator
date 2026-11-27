import Link from "next/link";
import { SearchX } from "lucide-react";

export default function SiteNotFound() {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center text-center">
      <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-inset ring-border">
        <SearchX className="h-6 w-6" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">Страница не найдена</h1>
      <p className="mt-2 text-[14px] text-muted-foreground">Возможно, ссылка устарела или вакансию сняли с публикации.</p>
      <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-xl bg-foreground px-5 text-[15px] font-medium text-background">
        К вакансиям
      </Link>
    </div>
  );
}
