"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Currency, Format, Grade, Profile, Subscription } from "@/lib/types";
import { cn, currencySign, FORMAT_LABEL, GRADE_LABEL, plural } from "@/lib/utils";
import { K, useMe, useMeta, useProfile } from "./data";
import { MainButton } from "./main-button";
import { haptic, requestWriteAccess, useTelegram } from "./telegram";
import { Avatar, Button, Chip, Collapse, Section, Segmented, Separator, Skeleton, Switch } from "./ui";

const GRADES: Grade[] = ["intern", "junior", "middle", "senior", "lead"];
const FORMATS: Format[] = ["remote", "hybrid", "office"];
const CURRENCIES: Currency[] = ["RUB", "USD", "EUR", "KZT"];
const SUB_NAME = "Подходящие вакансии";
const MAX_FILE = 5 * 1024 * 1024;

const norm = (p: Profile) =>
  JSON.stringify({
    ...p,
    city: p.city?.trim() || null,
    skills: [...p.skills].sort(),
    stop_words: [...p.stop_words].sort(),
    work_formats: [...p.work_formats].sort(),
  });

const union = (a: string[], b: string[]) => {
  const seen = new Set(a.map((x) => x.toLowerCase()));
  return [...a, ...b.filter((x) => !seen.has(x.toLowerCase()) && (seen.add(x.toLowerCase()), true))];
};

// unsaved edits survive a tab switch
let draftMemo: Profile | null = null;

/* ---------------- tag input ---------------- */

function TagInput({ value, onChange, placeholder, suggestions = [], highlight }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; suggestions?: string[]; highlight?: Set<string> }) {
  const [text, setText] = useState("");
  const lower = useMemo(() => new Set(value.map((v) => v.toLowerCase())), [value]);
  const add = (raw: string) => {
    const parts = raw
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter((s) => s && s.length <= 40 && !lower.has(s.toLowerCase()));
    if (parts.length) {
      haptic.selection();
      onChange([...value, ...parts]);
    }
    setText("");
  };
  const q = text.trim().toLowerCase();
  const sugg = suggestions.filter((s) => !lower.has(s.toLowerCase()) && (!q || s.toLowerCase().includes(q))).slice(0, q ? 8 : 12);
  return (
    <div className="p-3">
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((t) => (
              <span
                key={t}
                className={cn(
                  "tg-pop inline-flex h-8 items-center gap-0.5 rounded-lg pl-2.5 text-[14px] font-medium",
                  highlight?.has(t.toLowerCase()) ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-[color-mix(in_srgb,var(--tg-button)_14%,transparent)] text-[var(--tg-link)]",
                )}
              >
                {t}
                <button type="button" aria-label={`Удалить ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="grid h-8 w-8 place-items-center opacity-70">
                  <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
              </span>
            ))}
        </div>
      )}
      <input
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          if (/[,;]$/.test(v)) add(v);
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => text.trim() && add(text)}
        enterKeyHint="done"
        placeholder={placeholder}
        className="h-11 w-full rounded-xl bg-muted px-3 text-[16px] outline-none placeholder:text-muted-foreground"
      />
      {sugg.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {sugg.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="tg-press inline-flex h-8 items-center gap-1 rounded-lg bg-muted px-2.5 text-[14px] text-foreground/85"
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- resume ---------------- */

function ResumeSection({ onResult }: { onResult: (r: { extracted: string[]; profile: Profile; grade: Grade | null }) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [found, setFound] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const handle = (r: Awaited<ReturnType<typeof api.uploadResumeText>>) => {
    haptic.notify("success");
    setFound(r.extracted_skills);
    setText("");
    setOpen(false);
    onResult({ extracted: r.extracted_skills, profile: r.profile, grade: r.grade_guess });
    toast.success(r.extracted_skills.length ? `Нашли ${r.extracted_skills.length} ${plural(r.extracted_skills.length, "навык", "навыка", "навыков")}` : "Навыки не найдены", {
      description: r.extracted_skills.length ? "Добавили их в профиль" : "Попробуйте вставить текст с разделом «Навыки»",
    });
  };
  const onErr = (e: Error) => {
    haptic.notify("error");
    toast.error("Не удалось разобрать резюме", { description: e.message });
  };
  const byText = useMutation({ mutationFn: (t: string) => api.uploadResumeText(t), onSuccess: handle, onError: onErr });
  const byFile = useMutation({ mutationFn: (f: File) => api.uploadResumeFile(f), onSuccess: handle, onError: onErr });
  const busy = byText.isPending || byFile.isPending;

  return (
    <Section title="Резюме" footer="Найдём навыки и грейд в тексте и добавим в профиль. Файл не сохраняется.">
      {open ? (
          <div key="ta" className="tg-fade">
            <div className="p-3">
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={7}
                maxLength={30000}
                placeholder="Вставьте текст резюме или раздел с опытом и навыками…"
                className="block w-full resize-none rounded-xl bg-muted p-3 text-[16px] leading-snug outline-none placeholder:text-muted-foreground"
              />
              <div className="mt-2.5 flex gap-2">
                <Button variant="plain" className="flex-1" onClick={() => setOpen(false)}>
                  Отмена
                </Button>
                <Button className="flex-[2]" disabled={text.trim().length < 30} loading={byText.isPending} onClick={() => byText.mutate(text.trim())}>
                  <Sparkles className="h-[18px] w-[18px]" /> Найти навыки
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div key="btns" className="tg-fade">
            <button type="button" disabled={busy} onClick={() => setOpen(true)} className="tg-press flex h-[52px] w-full items-center gap-3 px-4 text-left text-[16px] text-[var(--tg-link)] disabled:opacity-50">
              <Sparkles className="h-5 w-5" /> Вставить текст резюме
            </button>
            <Separator inset={52} />
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="tg-press flex h-[52px] w-full items-center gap-3 px-4 text-left text-[16px] text-[var(--tg-link)] disabled:opacity-50">
              <FileUp className="h-5 w-5" />
              {byFile.isPending ? "Разбираем файл…" : "Загрузить PDF или DOCX"}
            </button>
          </div>
        )}
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (f.size > MAX_FILE) {
            toast.error("Файл больше 5 МБ");
            return;
          }
          byFile.mutate(f);
        }}
      />
      {found && found.length > 0 && (
        <div className="border-t-[0.5px] border-[var(--tg-separator)] p-3">
          <div className="mb-2 text-[13px] font-medium text-muted-foreground">Найдено в резюме</div>
          <div className="flex flex-wrap gap-1.5">
            {found.map((s, i) => (
              <span
                key={s}
                style={{ animationDelay: `${i * 40}ms` }}
                className="tg-pop inline-flex h-8 items-center rounded-lg bg-emerald-500/15 px-2.5 text-[14px] font-medium text-emerald-700 dark:text-emerald-300"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

/* ---------------- notifications ---------------- */

function NotificationsSection({ linked }: { linked: boolean }) {
  const qc = useQueryClient();
  const subs = useQuery({ queryKey: K.subs, queryFn: api.subscriptions, staleTime: 60_000 });
  const sub = subs.data?.find((s) => s.name === SUB_NAME) ?? null;
  const [minMatch, setMinMatch] = useState<number | null>(null);
  const shownMatch = minMatch ?? sub?.min_match ?? 70;

  const save = useMutation({
    mutationFn: async (patch: Partial<Pick<Subscription, "active" | "min_match" | "mode">>): Promise<Subscription> => {
      if (sub) return api.patchSubscription(sub.id, patch);
      return api.createSubscription({ name: SUB_NAME, filters: {}, mode: patch.mode ?? "instant", min_match: patch.min_match ?? 70 });
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: K.subs });
      const prev = qc.getQueryData<Subscription[]>(K.subs);
      if (sub) qc.setQueryData<Subscription[]>(K.subs, (l) => l?.map((s) => (s.id === sub.id ? { ...s, ...patch } : s)));
      return { prev };
    },
    onSuccess: (s) => {
      qc.setQueryData<Subscription[]>(K.subs, (l) => (l ? (l.some((x) => x.id === s.id) ? l.map((x) => (x.id === s.id ? s : x)) : [...l, s]) : [s]));
    },
    onError: (e, _p, ctx) => {
      if (ctx?.prev) qc.setQueryData(K.subs, ctx.prev);
      haptic.notify("error");
      toast.error("Не удалось сохранить уведомления", { description: (e as Error).message });
    },
  });

  // slider: commit after the finger settles
  useEffect(() => {
    if (minMatch == null || !sub || minMatch === sub.min_match) return;
    const id = setTimeout(() => save.mutate({ min_match: minMatch }), 500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minMatch]);

  const active = !!sub?.active;
  const toggle = async (on: boolean) => {
    if (on) {
      save.mutate(sub ? { active: true } : { mode: "instant", min_match: 70 }, {
        onSuccess: () => toast.success("Уведомления включены", { description: "Бот пришлёт вакансии с совпадением от " + (sub?.min_match ?? 70) + "%" }),
      });
      // the bot can only message users who allowed it
      const granted = await requestWriteAccess();
      if (granted === false) toast("Разрешите боту писать вам, иначе уведомления не дойдут");
    } else save.mutate({ active: false });
  };

  if (subs.isPending)
    return (
      <Section title="Уведомления">
        <div className="p-4">
          <Skeleton className="h-6 w-full" />
        </div>
      </Section>
    );

  return (
    <Section
      title="Уведомления"
      footer={!linked ? "Telegram не привязан к аккаунту — уведомления не дойдут." : active ? (sub?.mode === "digest" ? "Подборка раз в день в чате с ботом." : "Бот напишет, как только появится подходящая вакансия.") : "Бот будет присылать новые вакансии под ваш профиль."}
    >
      <div className="flex min-h-[52px] items-center gap-3 px-4 py-2">
        <div className="min-w-0 flex-1 text-[16px]">Присылать подходящие вакансии</div>
        <Switch checked={active} disabled={save.isPending && !sub} onChange={toggle} label="Присылать подходящие вакансии" />
      </div>
      <Collapse open={active && !!sub}>
        {sub && (
          <div>
            <Separator />
            <div className="px-4 pb-2 pt-3">
              <div className="flex items-baseline justify-between text-[15px]">
                <span>Совпадение не ниже</span>
                <span className="font-semibold tabular-nums text-[var(--tg-link)]">{shownMatch}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={90}
                step={5}
                value={shownMatch}
                onChange={(e) => {
                  haptic.selection();
                  setMinMatch(Number(e.target.value));
                }}
                aria-label="Минимальное совпадение"
                className="tg-range mt-1"
                style={{ ["--fill" as string]: `${((shownMatch - 50) / 40) * 100}%` }}
              />
              <div className="flex justify-between text-[12px] text-muted-foreground">
                <span>50% · больше вакансий</span>
                <span>90% · только точные</span>
              </div>
            </div>
            <Separator />
            <div className="px-4 py-3">
              <Segmented
                value={sub.mode}
                onChange={(mode) => save.mutate({ mode })}
                options={[
                  { value: "instant", label: "Сразу" },
                  { value: "digest", label: "Раз в день" },
                ]}
              />
            </div>
          </div>
        )}
      </Collapse>
    </Section>
  );
}

/* ---------------- screen ---------------- */

export function ProfileScreen() {
  const qc = useQueryClient();
  const { user: tgUser } = useTelegram();
  const me = useMe();
  const profile = useProfile();
  const meta = useMeta();
  const [draft, setDraftRaw] = useState<Profile | null>(draftMemo);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const setDraft = (fn: (d: Profile) => Profile) =>
    setDraftRaw((d) => {
      const n = d ? fn(d) : d;
      draftMemo = n;
      return n;
    });

  useEffect(() => {
    if (profile.data && !draft) setDraftRaw(profile.data);
  }, [profile.data, draft]);

  const dirty = !!draft && !!profile.data && norm(draft) !== norm(profile.data);
  useEffect(() => {
    if (!dirty) draftMemo = null;
  }, [dirty]);

  const save = useMutation({
    mutationFn: (p: Profile) => api.saveProfile({ ...p, city: p.city?.trim() || null }),
    onSuccess: (p) => {
      haptic.notify("success");
      qc.setQueryData(K.profile, p);
      setDraftRaw(p);
      draftMemo = null;
      // ranking and match explanations depend on the profile
      void qc.invalidateQueries({ queryKey: K.feedAll });
      void qc.invalidateQueries({ queryKey: ["tg", "match"] });
      void qc.invalidateQueries({ queryKey: ["tg", "vacancy"] });
      toast.success("Профиль сохранён", { description: p.skills.length || p.grade ? "Лента отсортирована по совпадению" : undefined });
    },
    onError: (e) => {
      haptic.notify("error");
      toast.error("Не удалось сохранить", { description: (e as Error).message });
    },
  });

  const name = me.data?.display_name || [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(" ") || me.data?.email || "Профиль";
  const username = me.data?.telegram_username || tgUser?.username;
  const photo = me.data?.photo_url || tgUser?.photo_url;
  const tagSuggestions = useMemo(() => (meta.data?.top_tags ?? []).map((t) => t.tag), [meta.data]);

  return (
    <div className="pb-6">
      <header className="flex flex-col items-center px-4 pb-1 pt-3 text-center">
        <Avatar src={photo} name={name} size={84} />
        <div className="mt-3 text-[22px] font-bold leading-tight tracking-[-0.02em]">{name}</div>
        {username && <div className="mt-0.5 text-[15px] text-muted-foreground">@{username}</div>}
      </header>

      {!draft ? (
        <div className="mt-5 space-y-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-[14px]" />
          ))}
        </div>
      ) : (
        <>
          <ResumeSection
            onResult={({ extracted, profile: p, grade }) => {
              // the backend already merged the skills into the stored profile: rebase the draft on it
              qc.setQueryData(K.profile, p);
              setFresh(new Set(extracted.map((s) => s.toLowerCase())));
              setDraft((d) => ({ ...d, skills: union(d.skills, p.skills), grade: d.grade ?? p.grade ?? grade }));
              void qc.invalidateQueries({ queryKey: K.feedAll });
            }}
          />

          <Section title="Навыки" footer="По ним считаем совпадение и сортируем ленту">
            <TagInput value={draft.skills} onChange={(skills) => setDraft((d) => ({ ...d, skills }))} placeholder="Добавить навык, например Python" suggestions={tagSuggestions} highlight={fresh} />
          </Section>

          <Section title="Грейд">
            <div className="tg-scroll-x flex gap-2 p-3">
              {GRADES.map((g) => (
                <Chip key={g} active={draft.grade === g} onClick={() => setDraft((d) => ({ ...d, grade: d.grade === g ? null : g }))} className={draft.grade === g ? undefined : "bg-muted"}>
                  {GRADE_LABEL[g]}
                </Chip>
              ))}
            </div>
          </Section>

          <Section title="Формат работы">
            <div className="flex flex-wrap gap-2 p-3">
              {FORMATS.map((f) => {
                const on = draft.work_formats.includes(f);
                return (
                  <Chip key={f} active={on} onClick={() => setDraft((d) => ({ ...d, work_formats: on ? d.work_formats.filter((x) => x !== f) : [...d.work_formats, f] }))} className={on ? undefined : "bg-muted"}>
                    {FORMAT_LABEL[f]}
                  </Chip>
                );
              })}
            </div>
          </Section>

          <Section title="Желаемая зарплата" footer="На руки в месяц. Вакансии ниже получат меньше баллов совпадения.">
            <div className="flex items-center gap-2 px-4 py-2">
              <input
                type="text"
                inputMode="numeric"
                value={draft.desired_salary != null ? draft.desired_salary.toLocaleString("ru-RU") : ""}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/\D/g, "").slice(0, 9));
                  setDraft((d) => ({ ...d, desired_salary: n > 0 ? n : null }));
                }}
                placeholder="Например, 250 000"
                className="h-11 min-w-0 flex-1 bg-transparent text-[17px] tabular-nums outline-none placeholder:text-muted-foreground"
              />
              <span className="text-[17px] text-muted-foreground">{currencySign(draft.currency)}</span>
            </div>
            <Separator />
            <div className="p-3">
              <Segmented value={draft.currency} onChange={(currency) => setDraft((d) => ({ ...d, currency }))} options={CURRENCIES.map((c) => ({ value: c, label: `${c} ${currencySign(c)}` }))} />
            </div>
          </Section>

          <Section title="Город">
            <input
              value={draft.city ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value || null }))}
              placeholder="Москва, Алматы, Белград…"
              maxLength={80}
              list="tg-cities"
              className="h-[52px] w-full bg-transparent px-4 text-[16px] outline-none placeholder:text-muted-foreground"
            />
            <datalist id="tg-cities">
              {(meta.data?.cities ?? []).slice(0, 30).map((c) => (
                <option key={c.city} value={c.city} />
              ))}
            </datalist>
          </Section>

          <Section title="Стоп-слова" footer="Вакансии с этими словами опустятся вниз: например, «1С», «gambling», «офис 6/1»">
            <TagInput value={draft.stop_words} onChange={(stop_words) => setDraft((d) => ({ ...d, stop_words }))} placeholder="Добавить стоп-слово" />
          </Section>

          <NotificationsSection linked={me.data?.telegram_linked ?? true} />

          {dirty && <div className="h-20" />}
        </>
      )}

      <MainButton visible={dirty} text="Сохранить" loading={save.isPending} onClick={() => draft && save.mutate(draft)} aboveTabs />
    </div>
  );
}
