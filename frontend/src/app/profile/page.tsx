"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Profile } from "@/lib/types";
import { GRADE_LABEL } from "@/lib/utils";
import { Badge, Button, EmptyState, Skeleton } from "@/components/ui/primitives";
import { ResumeCard } from "@/components/profile/resume-card";
import { PreferencesCard } from "@/components/profile/preferences-card";
import { TelegramCard } from "@/components/profile/telegram-card";
import { SubscriptionsCard } from "@/components/profile/subscriptions-card";

const fade = (i: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] as const },
});

export default function ProfilePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { isAuthed, user } = useAuth();
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ["profile"], queryFn: api.profile, enabled: mounted && isAuthed });

  if (!mounted) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!isAuthed) {
    return (
      <div className="mx-auto max-w-lg pt-12">
        <EmptyState
          icon={<UserRound className="h-5 w-5" />}
          title="Войдите, чтобы настроить профиль"
          description="Загрузите резюме — мы извлечём навыки, посчитаем match score для каждой вакансии и покажем, что выучить для роста."
          action={
            <div className="flex gap-2">
              <Link href="/login?next=/profile">
                <Button>Войти</Button>
              </Link>
              <Link href="/register?next=/profile">
                <Button variant="secondary">Регистрация</Button>
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  const onProfile = (p: Profile) => {
    qc.setQueryData(["profile"], p);
    qc.invalidateQueries({ queryKey: ["vacancies"] });
    qc.invalidateQueries({ queryKey: ["skill-gap"] });
  };

  const p = profile.data;

  return (
    <div className="space-y-6">
      <motion.div {...fade(0)} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Профиль</h1>
          <p className="mt-1 text-sm text-muted-foreground">{user?.email ?? "…"} · резюме, предпочтения и уведомления</p>
        </div>
        {p && (
          <div className="flex flex-wrap gap-1.5">
            {p.grade && <Badge tone="primary">{GRADE_LABEL[p.grade]}</Badge>}
            <Badge tone="outline">{p.skills.length} навыков</Badge>
            {p.city && <Badge tone="outline">{p.city}</Badge>}
          </div>
        )}
      </motion.div>

      <div className="grid items-start gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-6">
          <motion.div {...fade(1)}>
            <ResumeCard onProfile={onProfile} />
          </motion.div>
          <motion.div {...fade(2)}>
            <PreferencesCard profile={p} loading={profile.isLoading} />
          </motion.div>
        </div>
        <div className="space-y-6">
          <motion.div {...fade(3)}>
            <TelegramCard />
          </motion.div>
          <motion.div {...fade(4)}>
            <SubscriptionsCard />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
