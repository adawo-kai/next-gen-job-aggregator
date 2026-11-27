"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Currency, Format, Grade, Profile } from "@/lib/types";
import { FORMAT_LABEL, GRADE_LABEL, currencySign } from "@/lib/utils";
import { Button, Card, CardHeader, Chip, Input, Label, Select, Skeleton } from "@/components/ui/primitives";
import { TagInput } from "./tag-input";

const GRADES: Grade[] = ["intern", "junior", "middle", "senior", "lead"];
const FORMATS: Format[] = ["remote", "hybrid", "office"];
const CURRENCIES: Currency[] = ["RUB", "USD", "EUR", "KZT", "KGS"];
const SKILL_SUGGESTIONS = ["Python", "TypeScript", "React", "Go", "PostgreSQL", "Docker", "Kubernetes", "Kafka", "Redis", "FastAPI", "Next.js", "SQL"];

export function PreferencesCard({ profile, loading }: { profile: Profile | undefined; loading: boolean }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Profile | null>(profile ?? null);

  useEffect(() => {
    if (profile) setForm(profile);
  }, [profile]);

  const dirty = useMemo(() => !!form && !!profile && JSON.stringify(form) !== JSON.stringify(profile), [form, profile]);

  const save = useMutation({
    mutationFn: (p: Profile) => api.saveProfile(p),
    onSuccess: (p) => {
      qc.setQueryData(["profile"], p);
      qc.invalidateQueries({ queryKey: ["vacancies"] });
      toast.success("Профиль сохранён", { description: "Match score пересчитается для новых выдач" });
    },
    onError: (e) => toast.error("Не удалось сохранить", { description: (e as Error).message }),
  });

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <Card>
      <CardHeader
        icon={<SlidersHorizontal className="h-4 w-4" />}
        title="Предпочтения"
        description="Используются для match score, подписок и skill-gap аналитики"
        action={
          <AnimatePresence>
            {dirty && (
              <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="inline-flex h-6 items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 text-[11.5px] font-medium text-amber-600 ring-1 ring-inset ring-amber-500/25 dark:text-amber-300"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Есть несохранённые изменения
              </motion.span>
            )}
          </AnimatePresence>
        }
      />
      {loading || !form ? (
        <div className="space-y-4 p-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <form
          className="space-y-5 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(form);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="salary">Желаемая зарплата</Label>
              <div className="relative">
                <Input
                  id="salary"
                  type="number"
                  min={0}
                  step={10000}
                  value={form.desired_salary ?? ""}
                  onChange={(e) => set("desired_salary", e.target.value === "" ? null : Number(e.target.value))}
                  placeholder="250000"
                  className="pr-12 tabular-nums"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currencySign(form.currency)}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currency">Валюта</Label>
              <Select id="currency" value={form.currency} onChange={(e) => set("currency", e.target.value as Currency)} className="w-full sm:w-24">
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">Город</Label>
              <Input id="city" value={form.city ?? ""} onChange={(e) => set("city", e.target.value || null)} placeholder="Москва" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Грейд</Label>
            <div className="flex flex-wrap gap-1.5">
              {GRADES.map((g) => (
                <Chip key={g} active={form.grade === g} onClick={() => set("grade", form.grade === g ? null : g)}>
                  {form.grade === g && <Check className="h-3 w-3" />}
                  {GRADE_LABEL[g]}
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Формат работы</Label>
            <div className="flex flex-wrap gap-1.5">
              {FORMATS.map((f) => {
                const on = form.work_formats.includes(f);
                return (
                  <Chip key={f} active={on} onClick={() => set("work_formats", on ? form.work_formats.filter((x) => x !== f) : [...form.work_formats, f])}>
                    {on && <Check className="h-3 w-3" />}
                    {FORMAT_LABEL[f]}
                  </Chip>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label>Навыки</Label>
              <span className="text-[11.5px] text-muted-foreground">Enter или запятая — добавить</span>
            </div>
            <TagInput value={form.skills} onChange={(v) => set("skills", v)} placeholder="Python, PostgreSQL, Docker…" suggestions={SKILL_SUGGESTIONS} />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Ban className="h-3.5 w-3.5" /> Стоп-слова
            </Label>
            <TagInput value={form.stop_words} onChange={(v) => set("stop_words", v)} placeholder="1С, Битрикс, «мы — семья»…" tone="danger" />
            <p className="text-[12px] text-muted-foreground">Вакансии с этими словами получат низкий match score и не попадут в уведомления.</p>
          </div>

          <div className="flex items-center justify-end gap-2 border-t pt-4">
            {dirty && (
              <Button type="button" variant="ghost" size="sm" onClick={() => profile && setForm(profile)}>
                Сбросить
              </Button>
            )}
            <Button type="submit" size="sm" loading={save.isPending} disabled={!dirty}>
              {!save.isPending && <Check className="h-3.5 w-3.5" />}
              Сохранить
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
