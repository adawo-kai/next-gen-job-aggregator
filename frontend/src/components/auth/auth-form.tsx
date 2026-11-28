"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/nav";
import { Button, Card, Input, Label } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { MIN_PASSWORD, passwordError, passwordStrength } from "@/lib/password";

/** Strength bars + a one-line hint under a new-password field. */
export function PasswordStrength({ password, id }: { password: string; id?: string }) {
  const st = passwordStrength(password);
  return (
    <div className="pt-1">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              i < st.score ? (st.score >= 3 ? "bg-emerald-400" : st.score === 2 ? "bg-amber-400" : "bg-rose-400") : "bg-border-strong",
            )}
          />
        ))}
      </div>
      <p id={id} aria-live="polite" className="mt-1.5 min-h-[18px] text-[12px] text-muted-foreground">
        {st.label || `Минимум ${MIN_PASSWORD} символов, не «12345678» и не «qwerty»`}
      </p>
    </div>
  );
}

export function PasswordInput({ id, value, onChange, placeholder, autoComplete }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; autoComplete?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="h-10 pl-9 pr-10"
        required
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-0.5 top-1/2 grid h-9 w-9 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
        aria-label={show ? "Скрыть пароль" : "Показать пароль"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isRegister = mode === "register";
  const next = params.get("next") || "/";
  const nextQs = params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : "";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isRegister) {
      const pwErr = passwordError(password);
      if (pwErr) return setError(pwErr);
      if (password !== confirm) return setError("Пароли не совпадают");
    }
    setLoading(true);
    try {
      await login(email.trim(), password, mode);
      toast.success(isRegister ? "Аккаунт создан" : "С возвращением!", {
        description: isRegister ? "Три шага — и лента подстроится под вас" : email.trim(),
      });
      // new accounts land on the onboarding checklist in the profile
      router.push(isRegister ? "/profile?welcome=1" : next.startsWith("/") ? next : "/");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 401 ? "Неверный email или пароль" : err.status === 409 ? "Такой email уже зарегистрирован" : err.detail);
      } else setError("Не удалось связаться с сервером");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[calc(100dvh-10rem)] items-center justify-center py-10">
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-[110px]" />
      <div className="pointer-events-none absolute left-[58%] top-[40%] -z-10 h-[260px] w-[260px] rounded-full bg-cyan-400/10 blur-[90px]" />
      <motion.div initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <Card className="p-6 shadow-2xl shadow-black/20 backdrop-blur">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold tracking-tight">{isRegister ? "Создать аккаунт" : "Вход в JobRadar"}</h1>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {isRegister ? "Совпадение с резюме, трекер откликов и уведомления в Telegram" : "Продолжите поиск с того места, где остановились"}
            </p>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input id="email" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10 pl-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Пароль</Label>
                {!isRegister && (
                  <Link href="/forgot-password" className="-my-2 inline-flex min-h-10 items-center text-[12.5px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline">
                    Забыли пароль?
                  </Link>
                )}
              </div>
              <PasswordInput id="password" value={password} onChange={setPassword} placeholder={isRegister ? `Минимум ${MIN_PASSWORD} символов` : "••••••••"} autoComplete={isRegister ? "new-password" : "current-password"} />
              {isRegister && <PasswordStrength password={password} />}
            </div>
            {isRegister && (
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Повторите пароль</Label>
                <PasswordInput id="confirm" value={confirm} onChange={setConfirm} placeholder="••••••••" autoComplete="new-password" />
              </div>
            )}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-[13px] text-rose-600 ring-1 ring-inset ring-rose-500/25 dark:text-rose-300">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {error}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <Button type="submit" size="lg" loading={loading} className="w-full">
              {isRegister ? "Зарегистрироваться" : "Войти"}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
            {isRegister && (
              <p className="text-center text-[12px] leading-relaxed text-muted-foreground">
                Регистрируясь, вы принимаете{" "}
                <Link href="/terms" target="_blank" className="text-foreground underline underline-offset-2">
                  Соглашение
                </Link>{" "}
                и{" "}
                <Link href="/privacy" target="_blank" className="text-foreground underline underline-offset-2">
                  Политику
                </Link>
                .
              </p>
            )}
          </form>
        </Card>
        <p className="mt-5 text-center text-[13px] text-muted-foreground">
          {isRegister ? "Уже есть аккаунт? " : "Нет аккаунта? "}
          <Link href={(isRegister ? "/login" : "/register") + nextQs} className="font-medium text-foreground underline-offset-4 hover:underline">
            {isRegister ? "Войти" : "Зарегистрироваться"}
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
