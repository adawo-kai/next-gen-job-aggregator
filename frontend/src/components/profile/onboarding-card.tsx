"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, FileText, PartyPopper, Send, SlidersHorizontal, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, Card } from "@/components/ui/primitives";
import { useTelegramLink } from "./telegram-card";

const KEY = "nja.onboarding"; // "open" after registration, "dismissed" once closed

function readState(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function writeState(v: string) {
  try {
    localStorage.setItem(KEY, v);
  } catch {}
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.querySelector<HTMLElement>("textarea, input, button")?.focus({ preventScroll: true });
}

/** Three first steps after registration. Shown for /profile?welcome=1 and until dismissed. */
export function OnboardingCard({ profile }: { profile: Profile | undefined }) {
  const { user } = useAuth();
  const tg = useTelegramLink();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const welcome = new URLSearchParams(window.location.search).get("welcome") === "1";
    const st = readState();
    if (welcome && st !== "dismissed") writeState("open");
    setVisible(st === "open" || (welcome && st !== "dismissed"));
  }, []);

  const dismiss = () => {
    writeState("dismissed");
    setVisible(false);
    const url = new URL(window.location.href);
    if (url.searchParams.has("welcome")) {
      url.searchParams.delete("welcome");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  };

  const steps = [
    {
      key: "resume",
      icon: FileText,
      title: "Вставьте резюме или навыки",
      text: "По ним считаем совпадение с каждой вакансией",
      done: !!profile && profile.skills.length > 0,
      action: { label: "К резюме", run: () => scrollToId("resume") },
    },
    {
      key: "prefs",
      icon: SlidersHorizontal,
      title: "Укажите грейд, формат и зарплату",
      text: "Чтобы лента и уведомления не присылали лишнего",
      done: !!profile && !!profile.grade && profile.work_formats.length > 0 && profile.desired_salary != null,
      action: { label: "К предпочтениям", run: () => scrollToId("preferences") },
    },
    {
      key: "tg",
      icon: Send,
      title: "Привяжите Telegram для уведомлений",
      text: "Новые подходящие вакансии и напоминания из трекера",
      done: !!user?.telegram_linked,
      action: { label: "Привязать", run: () => tg.mutate(), loading: tg.isPending },
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.section
          aria-labelledby="onboarding-title"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginTop: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <Card className="relative overflow-hidden bg-gradient-to-r from-violet-500/[0.07] via-transparent to-cyan-500/[0.07] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="onboarding-title" className="flex items-center gap-2 text-[16px] font-semibold tracking-tight">
                  {allDone && <PartyPopper className="h-4 w-4 text-emerald-500" />}
                  {allDone ? "Всё готово — лента настроена под вас" : "Добро пожаловать! Три шага до точной ленты"}
                </h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  Готово {doneCount} из {steps.length}
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={dismiss} aria-label="Скрыть подсказку">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
              <motion.div className="h-full rounded-full bg-emerald-400" animate={{ width: `${(doneCount / steps.length) * 100}%` }} transition={{ duration: 0.5 }} />
            </div>
            <ol className="mt-4 grid gap-2.5 md:grid-cols-3">
              {steps.map((s, i) => (
                <li
                  key={s.key}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border bg-card/70 p-3",
                    s.done && "border-emerald-500/30 bg-emerald-500/[0.05]",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold ring-1 ring-inset",
                      s.done ? "bg-emerald-500 text-white ring-emerald-500" : "bg-muted text-muted-foreground ring-border",
                    )}
                  >
                    {s.done ? <Check className="h-4 w-4" aria-label="Сделано" /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-[13.5px] font-medium leading-snug", s.done && "text-muted-foreground")}>{s.title}</div>
                    <div className="mt-0.5 text-[12px] text-muted-foreground">{s.text}</div>
                    {!s.done && (
                      <Button size="sm" variant="secondary" className="mt-2" onClick={s.action.run} loading={"loading" in s.action ? s.action.loading : false}>
                        {s.action.label}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
