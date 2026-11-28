import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { buttonClass } from "@/components/ui/button-class";

export const metadata: Metadata = {
  title: "Вакансия не найдена — возможно, её уже закрыли",
  robots: { index: false },
};

export default function VacancyNotFound() {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center text-center">
      <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-inset ring-border">
        <SearchX className="h-6 w-6" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">Вакансия не найдена</h1>
      <p className="mt-2 text-[14px] text-muted-foreground">Возможно, её уже закрыли или ссылка устарела. Похожие вакансии — в общей ленте.</p>
      <Link href="/" className={buttonClass({ size: "lg", className: "mt-6" })}>
        К вакансиям
      </Link>
    </div>
  );
}
