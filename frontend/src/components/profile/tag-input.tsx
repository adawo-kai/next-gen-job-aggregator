"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function TagInput({
  value,
  onChange,
  placeholder = "Добавить…",
  tone = "default",
  suggestions = [],
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  tone?: "default" | "danger";
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  const add = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const lower = new Set(value.map((v) => v.toLowerCase()));
    const next = [...value];
    for (const p of parts) if (!lower.has(p.toLowerCase())) {
      next.push(p);
      lower.add(p.toLowerCase());
    }
    onChange(next);
    setDraft("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const chipCls =
    tone === "danger"
      ? "bg-rose-500/10 text-rose-600 ring-rose-500/25 dark:text-rose-300"
      : "bg-primary/10 text-foreground ring-primary/30";

  const remaining = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())).slice(0, 8);

  return (
    <div>
      <div
        onClick={() => ref.current?.focus()}
        className="flex min-h-10 w-full cursor-text flex-wrap items-center gap-1.5 rounded-lg bg-muted/50 px-2 py-1.5 ring-1 ring-inset ring-input transition-shadow focus-within:bg-transparent focus-within:ring-2 focus-within:ring-ring"
      >
        <AnimatePresence initial={false}>
          {value.map((t) => (
            <motion.span
              key={t}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              className={cn("inline-flex h-6 items-center gap-1 rounded-md pl-2 pr-1 text-[12.5px] font-medium ring-1 ring-inset", chipCls)}
            >
              {t}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(value.filter((v) => v !== t));
                }}
                className="touch-hit grid h-4 w-4 cursor-pointer place-items-center rounded opacity-60 transition hover:bg-foreground/10 hover:opacity-100"
                aria-label={`Удалить ${t}`}
              >
                <X className="h-3 w-3" />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={value.length ? "" : placeholder}
          className="h-6 min-w-[120px] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground/70"
        />
      </div>
      {remaining.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {remaining.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="h-6 cursor-pointer rounded-md px-2 text-[12px] text-muted-foreground border border-dashed border-border-strong transition hover:border-primary/50 hover:text-foreground"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
