"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { KanbanSquare, Newspaper, RefreshCw, UserRound, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Toaster } from "sonner";
import { api, ApiError, disableMockFallback, tokens } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BOT_USERNAME, K } from "./data";
import { getWebApp, haptic, initWebApp, notifyWebAppReady, openTelegramLink, useTelegram, waitForWebApp } from "./telegram";
import { Button, Skeleton } from "./ui";

// Real users: never fall back to the demo dataset inside the Mini App.
disableMockFallback();

type Phase = "boot" | "ready" | "outside" | "expired" | "error";

const TABS = [
  { href: "/tg", label: "Лента", icon: Newspaper },
  { href: "/tg/tracker", label: "Трекер", icon: KanbanSquare },
  { href: "/tg/profile", label: "Профиль", icon: UserRound },
] as const;

const DEEP_LINK_KEY = "tg.startapp.done";

function deepLinkTarget(): string | null {
  const sp = getWebApp()?.initDataUnsafe?.start_param;
  const m = sp ? /^v_(\d{1,12})$/.exec(sp) : null;
  if (!m) return null;
  try {
    // only on launch: going back to the feed must not bounce the user to the vacancy again
    if (sessionStorage.getItem(DEEP_LINK_KEY) === sp) return null;
    sessionStorage.setItem(DEEP_LINK_KEY, sp!);
  } catch {}
  return `/tg/v/${m[1]}`;
}

function useAccess() {
  return useSyncExternalStore(
    tokens.subscribe,
    () => tokens.access,
    () => null,
  );
}

export function TgShell({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("boot");
  const [errMsg, setErrMsg] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const access = useAccess();
  const { colorScheme } = useTelegram();

  const authenticate = useCallback(() => {
    if (running.current) return running.current;
    running.current = (async () => {
      const wa = await waitForWebApp();
      if (wa) {
        initWebApp(wa);
        notifyWebAppReady();
      }
      const initData = wa?.initData ?? "";
      let next: Phase = "outside";
      try {
        if (initData) {
          // initData is the source of truth inside Telegram: always exchange it, so a stale token of
          // another account (shared device / Telegram Desktop) can never leak into this session
          const t = await api.telegramWebApp(initData);
          qc.removeQueries({ queryKey: ["tg"] });
          tokens.set(t);
          void qc.prefetchQuery({ queryKey: K.me, queryFn: api.me });
          next = "ready";
        } else if (tokens.access || tokens.refresh) {
          // opened outside Telegram (or a local preview) with an existing session of this browser
          try {
            qc.setQueryData(K.me, await api.me());
            next = "ready";
          } catch (e) {
            if (e instanceof ApiError && e.status === 401) tokens.clear();
            else throw e;
          }
        }
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 422)) next = "expired";
        else {
          next = "error";
          setErrMsg(e instanceof ApiError && e.status ? e.detail : "Проверьте интернет и попробуйте ещё раз");
        }
      }
      if (next === "ready") {
        const target = deepLinkTarget();
        if (target && target !== window.location.pathname) {
          setPending(target);
          router.replace(target);
        }
      }
      setPhase(next);
    })().finally(() => {
      running.current = null;
    });
    return running.current;
  }, [qc, router]);

  useEffect(() => {
    void authenticate();
  }, [authenticate]);

  // refresh token died mid-session -> re-authenticate with initData (or show the expired screen)
  useEffect(() => {
    if (phase === "ready" && !access) {
      setPhase("boot");
      void authenticate();
    }
  }, [phase, access, authenticate]);

  useEffect(() => {
    if (pending && pathname === pending) setPending(null);
  }, [pathname, pending]);

  const showTabs = phase === "ready" && TABS.some((t) => t.href === pathname);
  const canRender = phase === "ready" && (!pending || pathname === pending);

  return (
    <>
      <div
        className="mx-auto w-full max-w-[640px] px-3"
        style={{
          paddingTop: "calc(var(--tg-content-top) + 8px)",
          paddingBottom: showTabs ? "calc(var(--tg-tabbar-h) + var(--tg-safe-bottom) + 20px)" : "calc(var(--tg-safe-bottom) + 24px)",
        }}
      >
        {canRender ? children : phase === "boot" || phase === "ready" ? <BootSkeleton /> : <GateScreen phase={phase} message={errMsg} onRetry={() => { setPhase("boot"); void authenticate(); }} />}
      </div>
      {showTabs && <TabBar pathname={pathname} />}
      <Toaster
        position="top-center"
        theme={colorScheme}
        offset={{ top: "calc(var(--tg-content-top) + 10px)" }}
        mobileOffset={{ top: "calc(var(--tg-content-top) + 10px)" }}
        toastOptions={{
          classNames: {
            toast: "!rounded-[14px] !border-0 !bg-[var(--tg-section-bg)] !text-[var(--tg-text)] !text-[15px] !shadow-[0_8px_30px_rgba(0,0,0,0.18)]",
            description: "!text-[var(--tg-hint)]",
            actionButton: "!bg-[var(--tg-button)] !text-[var(--tg-button-text)]",
          },
        }}
      />
    </>
  );
}

/* ---------------- tab bar ---------------- */

function TabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t-[0.5px] border-[var(--tg-separator)] bg-[color-mix(in_srgb,var(--tg-bg)_88%,transparent)] backdrop-blur-xl"
      style={{ paddingBottom: "var(--tg-safe-bottom)" }}
      aria-label="Разделы"
    >
      <div className="mx-auto flex h-[var(--tg-tabbar-h)] max-w-[640px]">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              replace
              scroll={false}
              aria-current={active ? "page" : undefined}
              onClick={(e) => {
                if (active) {
                  e.preventDefault();
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  return;
                }
                haptic.selection();
              }}
              className={cn("flex flex-1 flex-col items-center justify-center gap-[3px] text-[11px] font-medium transition-colors", active ? "text-[var(--tg-link)]" : "text-muted-foreground")}
            >
              <t.icon className="h-[25px] w-[25px]" strokeWidth={active ? 2.2 : 1.8} />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* ---------------- gate screens ---------------- */

export function LogoMark({ size = 64 }: { size?: number }) {
  return (
    <span className="grid place-items-center rounded-[22%] bg-gradient-to-br from-[#8b7cff] to-[#22d3ee] shadow-[0_10px_30px_-8px_rgba(109,92,255,0.55)]" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" className="text-white" style={{ width: size * 0.55, height: size * 0.55 }} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
        <path d="M12 12 L19 5" />
        <path d="M4.5 16.5a8.5 8.5 0 1 1 15 0" opacity={0.55} />
        <path d="M8 15a4.5 4.5 0 1 1 8 0" />
        <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

function GateScreen({ phase, message, onRetry }: { phase: Exclude<Phase, "boot" | "ready">; message: string; onRetry: () => void }) {
  const vacancy = typeof window !== "undefined" ? /^\/tg\/v\/(\d+)/.exec(window.location.pathname)?.[1] : undefined;
  const botUrl = `https://t.me/${BOT_USERNAME}${vacancy ? `?startapp=v_${vacancy}` : ""}`;
  return (
    <div className="flex min-h-[calc(var(--tg-viewport-stable-height,100dvh)-80px)] flex-col items-center justify-center px-6 text-center">
      {phase === "error" ? (
        <div className="grid h-16 w-16 place-items-center rounded-full bg-card text-muted-foreground">
          <WifiOff className="h-7 w-7" />
        </div>
      ) : (
        <LogoMark />
      )}
      {phase === "outside" && (
        <>
          <h1 className="mt-6 text-[22px] font-bold tracking-tight">Откройте JobRadar в Telegram</h1>
          <p className="mt-2 max-w-[320px] text-[15px] leading-snug text-muted-foreground">
            Это мини-приложение работает внутри Telegram: вход происходит автоматически по вашему аккаунту.
          </p>
          <a href={botUrl} className="mt-7 w-full max-w-[320px]">
            <Button size="lg" className="w-full">
              Открыть @{BOT_USERNAME}
            </Button>
          </a>
          <a href="/" className="mt-3 text-[15px] font-medium text-[var(--tg-link)]">
            Перейти на сайт
          </a>
        </>
      )}
      {phase === "expired" && (
        <>
          <h1 className="mt-6 text-[22px] font-bold tracking-tight">Сессия устарела</h1>
          <p className="mt-2 max-w-[320px] text-[15px] leading-snug text-muted-foreground">
            Перезапустите приложение: закройте его и откройте снова из чата с ботом.
          </p>
          <Button
            size="lg"
            className="mt-7 w-full max-w-[320px]"
            onClick={() => {
              const wa = getWebApp();
              if (wa && wa.platform !== "unknown") wa.close();
              else openTelegramLink(botUrl);
            }}
          >
            Перезапустить
          </Button>
        </>
      )}
      {phase === "error" && (
        <>
          <h1 className="mt-6 text-[22px] font-bold tracking-tight">Не удалось подключиться</h1>
          <p className="mt-2 max-w-[320px] text-[15px] leading-snug text-muted-foreground">{message}</p>
          <Button size="lg" className="mt-7 w-full max-w-[320px]" onClick={onRetry}>
            <RefreshCw className="h-[18px] w-[18px]" /> Повторить
          </Button>
        </>
      )}
    </div>
  );
}

function BootSkeleton() {
  return (
    <div aria-busy="true" aria-label="Загрузка">
      <div className="flex items-center gap-3 px-1 py-2">
        <Skeleton className="h-11 w-11 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-5 w-40" />
        </div>
      </div>
      <Skeleton className="mt-3 h-11 w-full rounded-xl" />
      <div className="mt-4 space-y-2.5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[132px] w-full rounded-[14px]" />
        ))}
      </div>
    </div>
  );
}
