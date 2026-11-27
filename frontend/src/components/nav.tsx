"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion } from "motion/react";
import { BarChart3, Briefcase, Database, KanbanSquare, LogOut, Moon, Search, Sun, User, UserCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth, useMockMode } from "@/lib/auth";
import { Button, Kbd, Tooltip } from "@/components/ui/primitives";
import { CommandPalette } from "@/components/command-palette";

const LINKS = [
  { href: "/", label: "Вакансии", icon: Briefcase },
  { href: "/tracker", label: "Трекер", icon: KanbanSquare },
  { href: "/analytics", label: "Аналитика", icon: BarChart3 },
  { href: "/profile", label: "Профиль", icon: User },
];

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("group flex items-center gap-2.5", className)}>
      <span className="relative grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#8b7cff] to-[#22d3ee] shadow-[0_0_20px_-4px_var(--glow)]">
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
          <path d="M12 12 L19 5" />
          <path d="M4.5 16.5a8.5 8.5 0 1 1 15 0" opacity={0.55} />
          <path d="M8 15a4.5 4.5 0 1 1 8 0" />
          <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight">
        Job<span className="text-muted-foreground group-hover:text-foreground transition-colors">Radar</span>
      </span>
    </Link>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = !mounted || resolvedTheme === "dark";
  return (
    <Button variant="ghost" size="icon" aria-label="Переключить тему" onClick={() => setTheme(dark ? "light" : "dark")}>
      <motion.span key={dark ? "d" : "l"} initial={{ rotate: -40, opacity: 0, scale: 0.7 }} animate={{ rotate: 0, opacity: 1, scale: 1 }} transition={{ duration: 0.25 }}>
        {dark ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
      </motion.span>
    </Button>
  );
}

export function MockBadge() {
  const mock = useMockMode();
  if (!mock) return null;
  return (
    <Tooltip content="Бэкенд недоступен — показаны реалистичные демо-данные. Все действия работают локально.">
      <motion.span
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="inline-flex h-6 shrink-0 cursor-default items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-500/10 px-2.5 text-[11.5px] font-medium text-amber-600 ring-1 ring-inset ring-amber-500/30 dark:text-amber-300"
      >
        <Database className="h-3 w-3" />
        <span className="hidden xl:inline">demo data</span>
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-400" />
        </span>
      </motion.span>
    </Tooltip>
  );
}

function UserMenu() {
  const { isAuthed, user, logout } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-9 w-20" />;
  if (!isAuthed)
    return (
      <div className="flex items-center gap-1.5">
        <Link href="/login">
          <Button variant="ghost" size="sm">Войти</Button>
        </Link>
        <Link href="/register" className="hidden sm:block">
          <Button size="sm">Регистрация</Button>
        </Link>
      </div>
    );
  const email = user ? user.email ?? user.display_name ?? (user.telegram_username ? "@" + user.telegram_username : "Telegram") : "…";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="flex h-9 cursor-pointer items-center gap-2 rounded-full py-1 pl-1 pr-1 outline-none ring-1 ring-inset ring-border transition hover:bg-muted sm:pr-3">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 text-[12px] font-semibold text-white">
            {email[0]?.toUpperCase()}
          </span>
          <span className="hidden max-w-[140px] truncate text-[13px] text-muted-foreground sm:block">{email}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-[220px] rounded-xl border bg-elevated p-1.5 shadow-2xl shadow-black/30">
          <div className="px-2.5 py-2">
            <div className="truncate text-[13px] font-medium">{email}</div>
            <div className="text-[12px] text-muted-foreground">{user?.telegram_linked ? "Telegram привязан" : "Telegram не привязан"}</div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item onSelect={() => router.push("/profile")} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-muted">
            <UserCircle2 className="h-4 w-4 text-muted-foreground" /> Профиль и резюме
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => router.push("/tracker")} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-muted">
            <KanbanSquare className="h-4 w-4 text-muted-foreground" /> Мои отклики
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            onSelect={() => {
              router.push("/");
              void logout();
            }}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-rose-500 outline-none data-[highlighted]:bg-rose-500/10"
          >
            <LogOut className="h-4 w-4" /> Выйти
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function Nav() {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/vacancies") : pathname.startsWith(href));

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/55">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="ml-4 hidden items-center gap-0.5 md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "relative rounded-lg px-3 py-1.5 text-[13.5px] font-medium transition-colors",
                  isActive(l.href) ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {isActive(l.href) && (
                  <motion.span layoutId="nav-pill" className="absolute inset-0 -z-10 rounded-lg bg-muted ring-1 ring-inset ring-border" transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />
                )}
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <MockBadge />
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden h-9 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg px-2.5 text-[13px] text-muted-foreground ring-1 ring-inset ring-border transition hover:text-foreground xl:flex"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="pr-6">Быстрый поиск</span>
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </button>
            <Button variant="ghost" size="icon" className="xl:hidden" onClick={() => setPaletteOpen(true)} aria-label="Поиск">
              <Search className="h-[18px] w-[18px]" />
            </Button>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>
      {/* mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium", isActive(l.href) ? "text-foreground" : "text-muted-foreground")}
          >
            <l.icon className="h-5 w-5" />
            {l.label}
          </Link>
        ))}
      </nav>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
