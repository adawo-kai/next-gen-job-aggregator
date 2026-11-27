import Link from "next/link";
import { BOT_URL, CONTACT_TG, CONTACT_TG_URL, GITHUB_URL } from "@/lib/site";

const linkCls = "inline-flex min-h-10 items-center text-muted-foreground transition-colors hover:text-foreground md:min-h-0";

export function SiteFooter() {
  return (
    <footer className="border-t pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 text-[13px] sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="text-muted-foreground">
          © {new Date().getFullYear()} JobRadar · агрегатор IT-вакансий. Вакансии принадлежат работодателям и площадкам-источникам.
        </div>
        <nav aria-label="Ссылки в подвале" className="flex flex-wrap gap-x-5 gap-y-0">
          <Link href="/privacy" className={linkCls}>
            Политика конфиденциальности
          </Link>
          <Link href="/terms" className={linkCls}>
            Соглашение
          </Link>
          <a href={BOT_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
            Telegram-бот
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
            GitHub
          </a>
          <a href={CONTACT_TG_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
            Связь: @{CONTACT_TG}
          </a>
        </nav>
      </div>
    </footer>
  );
}
