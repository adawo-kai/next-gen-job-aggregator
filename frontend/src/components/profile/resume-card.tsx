"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, FileText, FileUp, Sparkles, Type, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Profile, ResumeResult } from "@/lib/types";
import { cn, GRADE_LABEL } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Textarea } from "@/components/ui/primitives";

const ACCEPT = ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

export function ResumeCard({ onProfile }: { onProfile: (p: Profile) => void }) {
  const [tab, setTab] = useState<"file" | "text">("file");
  const [drag, setDrag] = useState(false);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ResumeResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const m = useMutation({
    mutationFn: (arg: { file?: File; text?: string }) => (arg.file ? api.uploadResumeFile(arg.file) : api.uploadResumeText(arg.text ?? "")),
    onSuccess: (r) => {
      setResult(r);
      onProfile(r.profile);
      toast.success(`Извлечено навыков: ${r.extracted_skills.length}`, { description: "Профиль обновлён — match score пересчитан" });
    },
    onError: (e) => toast.error("Не удалось разобрать резюме", { description: (e as Error).message }),
  });

  const handleFile = (f: File | undefined) => {
    if (!f) return;
    if (!/\.(pdf|docx|txt)$/i.test(f.name)) {
      toast.error("Поддерживаются PDF, DOCX и TXT");
      return;
    }
    setFileName(f.name);
    setResult(null);
    m.mutate({ file: f });
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<FileText className="h-4 w-4" />}
        title="Резюме"
        description="AI извлечёт навыки и грейд — на их основе считается match score"
        action={
          <div className="flex rounded-lg bg-muted p-0.5 ring-1 ring-inset ring-border">
            {(
              [
                ["file", "Файл", FileUp],
                ["text", "Текст", Type],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn(
                  "relative flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors",
                  tab === k ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab === k && <motion.span layoutId="resume-tab" className="absolute inset-0 -z-0 rounded-md bg-background shadow-sm ring-1 ring-inset ring-border" />}
                <Icon className="relative h-3.5 w-3.5" />
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>
        }
      />
      <div className="p-5">
        {m.isPending ? (
          <Processing name={fileName} />
        ) : tab === "file" ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all duration-200",
              drag ? "border-primary bg-primary/5 shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_12%,transparent),0_0_40px_-8px_var(--glow)]" : "border-border-strong hover:border-primary/50 hover:bg-muted/40",
            )}
          >
            <motion.div animate={drag ? { y: -4, scale: 1.08 } : { y: 0, scale: 1 }} className="relative mb-3 grid h-12 w-12 place-items-center rounded-xl bg-muted ring-1 ring-inset ring-border">
              <div className="absolute inset-0 -z-10 rounded-xl bg-primary/25 opacity-0 blur-xl transition-opacity group-hover:opacity-100" />
              <UploadCloud className={cn("h-5 w-5 transition-colors", drag ? "text-primary" : "text-muted-foreground")} />
            </motion.div>
            <div className="text-sm font-medium">{drag ? "Отпустите файл" : "Перетащите резюме сюда"}</div>
            <div className="mt-1 text-[12.5px] text-muted-foreground">или нажмите, чтобы выбрать · PDF, DOCX, TXT</div>
            {fileName && !drag && <div className="mt-3 text-[12px] text-muted-foreground">Последний файл: {fileName}</div>}
            <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? undefined)} />
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Вставьте текст резюме: опыт, стек, проекты… Например: «Python-разработчик, 4 года. FastAPI, PostgreSQL, Redis, Docker, Kafka…»"
            />
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-muted-foreground tabular-nums">{text.length} симв.</span>
              <Button
                size="sm"
                disabled={text.trim().length < 20}
                onClick={() => {
                  setResult(null);
                  setFileName(null);
                  m.mutate({ text });
                }}
              >
                <Sparkles className="h-3.5 w-3.5" /> Извлечь навыки
              </Button>
            </div>
          </div>
        )}

        <AnimatePresence>
          {result && !m.isPending && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-5 rounded-xl bg-gradient-to-br from-violet-500/[0.07] to-cyan-500/[0.05] p-4 ring-1 ring-inset ring-violet-500/20">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[13px] font-medium">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    Найдено {result.extracted_skills.length} навыков
                  </div>
                  {result.grade_guess && (
                    <Badge tone="primary">
                      <Sparkles className="h-3 w-3" /> Грейд по резюме: {GRADE_LABEL[result.grade_guess]}
                    </Badge>
                  )}
                </div>
                <motion.div className="flex flex-wrap gap-1.5" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } }}>
                  {result.extracted_skills.map((s) => (
                    <motion.span
                      key={s}
                      variants={{
                        hidden: { opacity: 0, scale: 0.6, filter: "blur(6px)", y: 6 },
                        show: { opacity: 1, scale: 1, filter: "blur(0px)", y: 0, transition: { type: "spring", bounce: 0.35, duration: 0.5 } },
                      }}
                      className="inline-flex h-7 items-center rounded-lg bg-background/70 px-2.5 text-[12.5px] font-medium ring-1 ring-inset ring-border-strong"
                    >
                      {s}
                    </motion.span>
                  ))}
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}

function Processing({ name }: { name: string | null }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-primary/[0.04] px-6 py-10 text-center">
      <motion.div
        className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-primary/15 to-transparent"
        animate={{ x: ["-100%", "300%"] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div animate={{ rotate: [0, 12, -12, 0], scale: [1, 1.1, 1] }} transition={{ duration: 1.8, repeat: Infinity }} className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-inset ring-primary/30">
        <Sparkles className="h-5 w-5" />
      </motion.div>
      <div className="text-sm font-medium">AI извлекает навыки…</div>
      <div className="mt-1 text-[12.5px] text-muted-foreground">{name ? `Читаем ${name}` : "Анализируем текст резюме"}</div>
      <div className="mx-auto mt-5 flex max-w-xs flex-wrap justify-center gap-1.5">
        {["w-14", "w-20", "w-12", "w-16", "w-10", "w-[72px]"].map((w, i) => (
          <div key={i} className={cn("skeleton h-6 rounded-lg", w)} />
        ))}
      </div>
    </div>
  );
}
