"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import { AlertCircle, ArrowLeft, CheckCircle2, KeyRound, Mail, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/nav";
import { Button, Card, Input, Label } from "@/components/ui/primitives";
import { PasswordInput } from "./auth-form";

export const MIN_PASSWORD = 8;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-[calc(100dvh-14rem)] items-center justify-center py-10">
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-[110px]" />
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <Card className="p-6 shadow-2xl shadow-black/20">{children}</Card>
        <p className="mt-5 text-center text-[13px] text-muted-foreground">
          <Link href="/login" className="inline-flex min-h-10 items-center gap-1.5 font-medium text-foreground underline-offset-4 hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Вернуться ко входу
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-[13px] text-rose-600 ring-1 ring-inset ring-rose-500/25 dark:text-rose-300">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      {text}
    </div>
  );
}

function Heading({ icon, title, text }: { icon: React.ReactNode; title: string; text: React.ReactNode }) {
  return (
    <div className="mb-6 text-center">
      <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-xl bg-muted text-foreground/80 ring-1 ring-inset ring-border">{icon}</div>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

/* ---------------- forgot ---------------- */

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) setError("Проверьте адрес электронной почты");
      else if (err instanceof ApiError && err.status === 429) setError("Слишком много попыток. Подождите немного и попробуйте снова.");
      else setError(err instanceof ApiError && err.status ? err.detail : "Не удалось связаться с сервером. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  if (sent)
    return (
      <Shell>
        <Heading
          icon={<MailCheck className="h-5 w-5 text-emerald-500" />}
          title="Проверьте почту"
          text={
            <>
              Если аккаунт с адресом <span className="font-medium text-foreground">{email.trim()}</span> существует, мы отправили на него ссылку для сброса пароля.
            </>
          }
        />
        <ul className="space-y-1.5 text-[13px] text-muted-foreground">
          <li>• Ссылка действует 1 час и сработает один раз.</li>
          <li>• Не пришло письмо? Проверьте «Спам» или запросите ещё раз через пару минут.</li>
        </ul>
        <Button variant="secondary" className="mt-5 h-11 w-full" onClick={() => setSent(false)}>
          Отправить ещё раз
        </Button>
      </Shell>
    );

  return (
    <Shell>
      <Heading icon={<KeyRound className="h-5 w-5" />} title="Восстановление пароля" text="Укажите email, с которым регистрировались, — пришлём ссылку для создания нового пароля." />
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
            <Input id="email" type="email" required autoComplete="email" autoFocus placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 pl-9" />
          </div>
        </div>
        <ErrorLine text={error} />
        <Button type="submit" size="lg" loading={loading} className="w-full">
          Отправить ссылку
        </Button>
      </form>
    </Shell>
  );
}

/* ---------------- reset ---------------- */

export function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { adoptTokens } = useAuth();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // the backend issues 43-char tokens; anything shorter can only be a truncated link
  const [invalid, setInvalid] = useState(token.length < 20);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) return setError(`Пароль должен быть не короче ${MIN_PASSWORD} символов`);
    if (password !== confirm) return setError("Пароли не совпадают");
    setLoading(true);
    try {
      const t = await api.resetPassword(token, password);
      await adoptTokens(t);
      setDone(true);
      toast.success("Пароль обновлён", { description: "Вы вошли в аккаунт" });
      setTimeout(() => router.push("/"), 1600);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 400 || err.status === 404 || err.status === 410)) setInvalid(true);
      else if (err instanceof ApiError && err.status === 422) setError(err.detail || "Пароль не подходит: попробуйте длиннее или сложнее");
      else setError(err instanceof ApiError && err.status ? err.detail : "Не удалось связаться с сервером. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  if (invalid)
    return (
      <Shell>
        <Heading
          icon={<AlertCircle className="h-5 w-5 text-amber-500" />}
          title="Ссылка недействительна"
          text="Срок действия ссылки истёк или она уже использована. Запросите новую — это займёт минуту."
        />
        <Link href="/forgot-password">
          <Button size="lg" className="w-full">
            Запросить новую ссылку
          </Button>
        </Link>
      </Shell>
    );

  if (done)
    return (
      <Shell>
        <Heading icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />} title="Пароль изменён" text="Вы вошли в аккаунт. Сейчас откроем ленту вакансий…" />
        <Link href="/">
          <Button size="lg" className="w-full">
            К вакансиям
          </Button>
        </Link>
      </Shell>
    );

  return (
    <Shell>
      <Heading icon={<KeyRound className="h-5 w-5" />} title="Новый пароль" text="Придумайте новый пароль. После сохранения все прежние сессии будут завершены." />
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">Новый пароль</Label>
          <PasswordInput id="password" value={password} onChange={setPassword} placeholder={`Минимум ${MIN_PASSWORD} символов`} autoComplete="new-password" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Повторите пароль</Label>
          <PasswordInput id="confirm" value={confirm} onChange={setConfirm} placeholder="••••••••" autoComplete="new-password" />
        </div>
        <ErrorLine text={error} />
        <Button type="submit" size="lg" loading={loading} className="w-full">
          Сохранить пароль
        </Button>
      </form>
    </Shell>
  );
}
