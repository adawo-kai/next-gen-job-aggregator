"use client";

import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { BarChart3, Briefcase, CornerDownLeft, KanbanSquare, Moon, Search, User } from "lucide-react";
import { useTheme } from "next-themes";
import { api } from "@/lib/api";
import { formatSalary } from "@/lib/utils";
import { Kbd } from "@/components/ui/primitives";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const { resolvedTheme, setTheme } = useTheme();
  const results = useQuery({
    queryKey: ["palette", dq],
    queryFn: () => api.vacancies({ q: dq, sort: "relevance" }, null, 6),
    enabled: open && dq.trim().length > 1,
  });

  const go = (href: string) => {
    onOpenChange(false);
    setQ("");
    router.push(href);
  };

  const itemCls =
    "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] text-muted-foreground outline-none data-[selected=true]:bg-muted data-[selected=true]:text-foreground";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in" />
        <Dialog.Content className="fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border bg-elevated shadow-2xl shadow-black/40">
          <Dialog.Title className="sr-only">Быстрый поиск</Dialog.Title>
          <Command shouldFilter={false} loop>
            <div className="flex items-center gap-3 border-b px-4">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Вакансия, стек, компания или команда…"
                className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70"
              />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2 scrollbar-thin">
              <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
                {results.isFetching ? "Ищем…" : "Ничего не найдено"}
              </Command.Empty>
              {results.data?.items.length ? (
                <Command.Group heading="Вакансии" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground/70">
                  {results.data.items.map((v) => (
                    <Command.Item key={v.id} value={`v-${v.id}`} onSelect={() => go(`/vacancies/${v.id}`)} className={itemCls}>
                      <Briefcase className="h-4 w-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-foreground">{v.title}</div>
                        <div className="truncate text-[12px]">
                          {v.company.name} · {formatSalary(v.salary, true) ?? "з/п не указана"}
                        </div>
                      </div>
                      <CornerDownLeft className="h-3.5 w-3.5 opacity-50" />
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              <Command.Group heading="Навигация" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground/70">
                {q.trim().length > 0 && (
                  <Command.Item value="search-all" onSelect={() => go(`/?q=${encodeURIComponent(q)}`)} className={itemCls}>
                    <Search className="h-4 w-4" /> Искать «{q}» во всех вакансиях
                  </Command.Item>
                )}
                <Command.Item value="nav-home" onSelect={() => go("/")} className={itemCls}>
                  <Briefcase className="h-4 w-4" /> Вакансии
                </Command.Item>
                <Command.Item value="nav-tracker" onSelect={() => go("/tracker")} className={itemCls}>
                  <KanbanSquare className="h-4 w-4" /> Трекер откликов
                </Command.Item>
                <Command.Item value="nav-analytics" onSelect={() => go("/analytics")} className={itemCls}>
                  <BarChart3 className="h-4 w-4" /> Аналитика рынка
                </Command.Item>
                <Command.Item value="nav-profile" onSelect={() => go("/profile")} className={itemCls}>
                  <User className="h-4 w-4" /> Профиль и резюме
                </Command.Item>
                <Command.Item
                  value="theme"
                  onSelect={() => {
                    setTheme(resolvedTheme === "dark" ? "light" : "dark");
                    onOpenChange(false);
                  }}
                  className={itemCls}
                >
                  <Moon className="h-4 w-4" /> Сменить тему
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
