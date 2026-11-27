"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellRing, CheckCircle2, ExternalLink, Send } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import { useAuth } from "@/lib/auth";
import { Button, Card } from "@/components/ui/primitives";

export function TelegramCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const linked = !!user?.telegram_linked;
  const m = useMutation({
    mutationFn: api.telegramLink,
    onSuccess: (r) => {
      track("tg_link");
      window.open(r.deep_link, "_blank", "noopener,noreferrer");
      toast.success("Откройте бота в Telegram", { description: "Нажмите «Start» — ссылка действует 10 минут" });
      setTimeout(() => qc.invalidateQueries({ queryKey: ["me"] }), 4000);
    },
    onError: (e) => toast.error("Не удалось получить ссылку", { description: (e as Error).message }),
  });

  return (
    <Card className="relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[#229ED9]/20 blur-3xl" />
      <div className="relative flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#37AEE2] to-[#1E96C8] text-white shadow-[0_8px_24px_-8px_#229ED9]">
          <Send className="h-[18px] w-[18px] -translate-x-px translate-y-px" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold tracking-tight">Telegram-бот</h3>
            {linked ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11.5px] font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/25 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> Привязан
              </span>
            ) : (
              <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11.5px] font-medium text-muted-foreground ring-1 ring-inset ring-border">Не привязан</span>
            )}
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Мгновенные уведомления о подходящих вакансиях, дайджесты и напоминания из трекера — с кнопками «В избранное», «Скрыть», «В трекер».
          </p>
          <ul className="mt-3 space-y-1.5 text-[12.5px] text-muted-foreground">
            {["Вакансии с match выше порога", "«Нет ответа 3 дня — напишите HR»", "Привязка через одноразовую deep-link"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <BellRing className="h-3.5 w-3.5 text-[#37AEE2]" /> {t}
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            loading={m.isPending}
            onClick={() => m.mutate()}
            className="mt-4 bg-[#229ED9] text-white shadow-[0_8px_24px_-10px_#229ED9] hover:bg-[#1E8FC4]"
          >
            {!m.isPending && (linked ? <ExternalLink className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />)}
            {linked ? "Перепривязать" : "Привязать Telegram"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
