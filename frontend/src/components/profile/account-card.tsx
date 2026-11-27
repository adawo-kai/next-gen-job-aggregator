"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Download, KeyRound, LogOut, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button, Card, CardHeader, Input, Label } from "@/components/ui/primitives";
import { PasswordInput } from "@/components/auth/auth-form";
import { MIN_PASSWORD } from "@/components/auth/password-forms";

const CONFIRM_WORD = "УДАЛИТЬ";

const errText = (e: unknown, fallback: string) => {
  if (!(e instanceof ApiError) || !e.status) return fallback;
  // an older backend without the account endpoints
  if (e.status === 404 || e.status === 405) return "Сервер пока не поддерживает это действие. Попробуйте позже.";
  return e.detail;
};

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------------- change password ---------------- */

function ChangePassword() {
  const { adoptTokens } = useAuth();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () => api.changePassword(current, next),
    onSuccess: async (t) => {
      await adoptTokens(t);
      setCurrent("");
      setNext("");
      setConfirm("");
      setOpen(false);
      toast.success("Пароль изменён", { description: "Остальные устройства вышли из аккаунта" });
    },
    onError: (e) => setError(errText(e, "Не удалось связаться с сервером")),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < MIN_PASSWORD) return setError(`Новый пароль должен быть не короче ${MIN_PASSWORD} символов`);
    if (next !== confirm) return setError("Пароли не совпадают");
    if (next === current) return setError("Новый пароль совпадает с текущим");
    m.mutate();
  };

  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex min-h-12 w-full cursor-pointer items-center gap-3 text-left" aria-expanded={open}>
        <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1">
          <span className="block text-[14px] font-medium">Сменить пароль</span>
          <span className="block text-[12.5px] text-muted-foreground">Другие устройства выйдут из аккаунта</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onSubmit={submit}
            className="overflow-hidden"
          >
            <div className="space-y-3 pb-2 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="cur-pass">Текущий пароль</Label>
                <PasswordInput id="cur-pass" value={current} onChange={setCurrent} autoComplete="current-password" placeholder="••••••••" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="new-pass">Новый пароль</Label>
                  <PasswordInput id="new-pass" value={next} onChange={setNext} autoComplete="new-password" placeholder={`От ${MIN_PASSWORD} символов`} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-pass2">Повторите</Label>
                  <PasswordInput id="new-pass2" value={confirm} onChange={setConfirm} autoComplete="new-password" placeholder="••••••••" />
                </div>
              </div>
              {error && (
                <p role="alert" className="text-[13px] text-rose-500">
                  {error}
                </p>
              )}
              <Button type="submit" loading={m.isPending} className="h-10">
                Сохранить пароль
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- delete dialog ---------------- */

function DeleteAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { forget } = useAuth();
  const router = useRouter();
  const [word, setWord] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ok = word.trim().toUpperCase() === CONFIRM_WORD;

  const m = useMutation({
    mutationFn: api.deleteMe,
    onSuccess: () => {
      onOpenChange(false);
      forget();
      router.push("/");
      toast.success("Аккаунт удалён", { description: "Все ваши данные стёрты. Спасибо, что были с нами." });
    },
    onError: (e) => setError(errText(e, "Не удалось удалить аккаунт. Попробуйте ещё раз.")),
  });

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (m.isPending) return;
        if (!v) {
          setWord("");
          setError(null);
        }
        onOpenChange(v);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border bg-elevated p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-5">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-500/10 text-rose-500 ring-1 ring-inset ring-rose-500/25">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <Dialog.Title className="text-[16px] font-semibold">Удалить аккаунт навсегда?</Dialog.Title>
              <Dialog.Description className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
                Будут сразу удалены профиль и резюме, трекер с заметками и напоминаниями, подписки и привязка Telegram. Восстановить их будет нельзя.
              </Dialog.Description>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (ok) m.mutate();
            }}
            className="mt-5 space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="confirm-delete">
                Чтобы подтвердить, введите <span className="font-semibold text-foreground">{CONFIRM_WORD}</span>
              </Label>
              <Input id="confirm-delete" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} className="h-11" placeholder={CONFIRM_WORD} />
            </div>
            {error && (
              <p role="alert" className="text-[13px] text-rose-500">
                {error}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary" className="h-11 sm:h-9" disabled={m.isPending}>
                  Отмена
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={!ok} loading={m.isPending} className="h-11 bg-rose-600 text-white shadow-none hover:bg-rose-600/90 sm:h-9">
                <Trash2 className="h-4 w-4" /> Удалить аккаунт
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ---------------- card ---------------- */

export function AccountCard() {
  const { user, forget } = useAuth();
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const exportData = useMutation({
    mutationFn: api.exportMe,
    onSuccess: (data) => {
      downloadJson(data, "jobradar-data.json");
      toast.success("Данные выгружены", { description: "Файл jobradar-data.json сохранён" });
    },
    onError: (e) => toast.error("Не удалось выгрузить данные", { description: errText(e, "Попробуйте ещё раз") }),
  });

  const logoutAll = useMutation({
    mutationFn: api.logoutAll,
    onSuccess: () => {
      forget();
      router.push("/login");
      toast.success("Вы вышли на всех устройствах");
    },
    onError: (e) => toast.error("Не удалось завершить сессии", { description: errText(e, "Попробуйте ещё раз") }),
  });

  const row = "flex min-h-12 w-full cursor-pointer items-center gap-3 text-left disabled:cursor-wait disabled:opacity-60";

  return (
    <Card>
      <CardHeader icon={<ShieldCheck className="h-4 w-4" />} title="Аккаунт" description={user?.email ? user.email : user?.telegram_username ? `Вход через Telegram · @${user.telegram_username}` : "Вход через Telegram"} />
      <div className="mt-3 divide-y px-5">
        {user?.email ? (
          <ChangePassword />
        ) : (
          <p className="py-3 text-[13px] text-muted-foreground">Аккаунт создан через Telegram — пароль не нужен, вход выполняется автоматически.</p>
        )}
        <button className={row} disabled={logoutAll.isPending} onClick={() => logoutAll.mutate()}>
          <LogOut className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1">
            <span className="block text-[14px] font-medium">Выйти на всех устройствах</span>
            <span className="block text-[12.5px] text-muted-foreground">Включая это. Пригодится, если вход был с чужого устройства</span>
          </span>
        </button>
        <button className={row} disabled={exportData.isPending} onClick={() => exportData.mutate()}>
          <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1">
            <span className="block text-[14px] font-medium">{exportData.isPending ? "Готовим файл…" : "Скачать мои данные"}</span>
            <span className="block text-[12.5px] text-muted-foreground">Профиль, трекер и подписки в JSON</span>
          </span>
        </button>
        <button className={row} onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-4 w-4 shrink-0 text-rose-500" />
          <span className="flex-1">
            <span className="block text-[14px] font-medium text-rose-500">Удалить аккаунт</span>
            <span className="block text-[12.5px] text-muted-foreground">Сразу и навсегда, вместе со всеми данными</span>
          </span>
        </button>
      </div>
      <p className="px-5 pb-5 pt-2 text-[12px] text-muted-foreground">
        Как мы обращаемся с данными —{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
          Политика конфиденциальности
        </Link>{" "}
        и{" "}
        <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
          Соглашение
        </Link>
        .
      </p>
      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
    </Card>
  );
}
