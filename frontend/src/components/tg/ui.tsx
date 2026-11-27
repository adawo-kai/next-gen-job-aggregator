"use client";

/* Lightweight, touch-first primitives for the Mini App. No Radix / tooltips (hover-only affordances
   make no sense on phones) — everything here is plain elements + Tailwind; motion is CSS-only (see tg.css). */

import { Loader2 } from "lucide-react";
import { createPortal } from "react-dom";
import { forwardRef, useEffect, useRef, useState } from "react";
import { cn, hashHue, initials, scoreTone } from "@/lib/utils";
import { haptic, useBackButton } from "./telegram";

/* ---------------- layout ---------------- */

export function Section({ title, footer, children, className, action }: { title?: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={cn("mt-5", className)}>
      {(title || action) && (
        <div className="mb-1.5 flex items-end justify-between px-4">
          {title && <h2 className="text-[13px] font-medium uppercase tracking-[0.04em] text-[var(--tg-section-header)]">{title}</h2>}
          {action}
        </div>
      )}
      <div className="overflow-hidden rounded-[14px] bg-card">{children}</div>
      {footer && <p className="mt-1.5 px-4 text-[13px] leading-snug text-muted-foreground">{footer}</p>}
    </section>
  );
}

export function Separator({ inset = 16 }: { inset?: number }) {
  return <div className="h-px scale-y-50 bg-[var(--tg-separator)]" style={{ marginLeft: inset }} />;
}

/* ---------------- buttons ---------------- */

type BtnVariant = "primary" | "tinted" | "plain" | "destructive";

export const Button = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean; size?: "md" | "lg" }>(
  function Button({ className, variant = "primary", loading, size = "md", children, disabled, ...props }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "tg-press inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold outline-none disabled:opacity-50",
          size === "lg" ? "h-[50px] px-5 text-[16px]" : "h-11 px-4 text-[15px]",
          variant === "primary" && "bg-primary text-primary-foreground",
          variant === "tinted" && "bg-[color-mix(in_srgb,var(--tg-button)_14%,transparent)] text-[var(--tg-link)]",
          variant === "plain" && "text-[var(--tg-link)]",
          variant === "destructive" && "bg-[color-mix(in_srgb,var(--tg-destructive)_12%,transparent)] text-[var(--tg-destructive)]",
          className,
        )}
        {...props}
      >
        {loading && <Loader2 className="h-[18px] w-[18px] animate-spin" />}
        {children}
      </button>
    );
  },
);

/** Chip with a 44px hit area (visual height 34px). */
export function Chip({ active, className, children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={(e) => {
        haptic.selection();
        onClick?.(e);
      }}
      className={cn(
        "tg-press relative inline-flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[14px] font-medium",
        "after:absolute after:-inset-y-[5px] after:inset-x-0 after:content-['']",
        active ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-muted-foreground", className)} />;
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("tg-skeleton", className)} style={style} />;
}

export function EmptyState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <div className="mb-4 grid h-16 w-16 place-items-center rounded-full bg-card text-muted-foreground">{icon}</div>
      <div className="text-[17px] font-semibold">{title}</div>
      {text && <p className="mt-1.5 text-[15px] leading-snug text-muted-foreground">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ---------------- avatars ---------------- */

function gradient(name: string) {
  const hue = hashHue(name);
  return `linear-gradient(135deg, hsl(${hue} 68% 58%), hsl(${(hue + 40) % 360} 72% 45%))`;
}

export function Avatar({ src, name, size = 40, rounded = "full" }: { src?: string | null; name: string; size?: number; rounded?: "full" | "xl" }) {
  const [broken, setBroken] = useState(false);
  const radius = rounded === "full" ? "rounded-full" : "rounded-[10px]";
  if (src && !broken)
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        style={{ width: size, height: size }}
        className={cn("shrink-0 bg-white object-contain", radius, rounded === "xl" && "p-[3px]")}
      />
    );
  return (
    <div
      aria-hidden
      className={cn("grid shrink-0 place-items-center font-semibold text-white", radius)}
      style={{ width: size, height: size, background: gradient(name || "?"), fontSize: Math.round(size * 0.38) }}
    >
      {initials(name) || "?"}
    </div>
  );
}

/* ---------------- match ring ---------------- */

export function MatchRing({ score, size = 44, stroke = 4 }: { score: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(score);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(score));
    return () => cancelAnimationFrame(id);
  }, [score]);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`Совпадение ${score}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone.stroke}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown / 100)}
          style={{ transition: "stroke-dashoffset 800ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className={cn("absolute inset-0 grid place-items-center font-semibold tabular-nums", tone.text)} style={{ fontSize: Math.round(size * 0.32) }}>
        {score}
      </div>
    </div>
  );
}

/** Progress bar that grows from 0 on mount. */
export function Bar({ value, className, delayMs = 0 }: { value: number; className?: string; delayMs?: number }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return (
    <div
      className={cn("h-full rounded-full", className)}
      style={{ width: `${w}%`, transition: `width 600ms cubic-bezier(0.22,1,0.36,1) ${delayMs}ms` }}
    />
  );
}

/* ---------------- switch / segmented ---------------- */

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        haptic.selection();
        onChange(!checked);
      }}
      className={cn("relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50", checked ? "bg-[#34c759]" : "bg-[var(--border-strong)]")}
    >
      <span
        className="absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.2)] transition-transform duration-200"
        style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }}
      />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn("flex rounded-[10px] bg-muted p-[2px]", className)} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (!active) haptic.selection();
              onChange(o.value);
            }}
            className={cn(
              "h-9 flex-1 rounded-[8px] px-2 text-[14px] font-medium transition-colors",
              active ? "bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-muted-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- collapse (height: auto transition via grid rows) ---------------- */

export function Collapse({ open, children, keepMounted = true }: { open: boolean; children: React.ReactNode; keepMounted?: boolean }) {
  const [everOpen, setEverOpen] = useState(open);
  useEffect(() => {
    if (open) setEverOpen(true);
  }, [open]);
  return (
    <div className="tg-collapse" data-open={open} aria-hidden={!open} inert={!open}>
      <div>{(keepMounted ? everOpen : open) ? children : null}</div>
    </div>
  );
}

/* ---------------- bottom sheet ---------------- */

const SHEET_MS = 340;

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode }) {
  const [render, setRender] = useState(open);
  const [shown, setShown] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ y0: number; t0: number; dy: number } | null>(null);
  useBackButton(open ? onClose : null);

  useEffect(() => {
    if (open) {
      setRender(true);
      // two frames: mount at translateY(100%), then transition in
      let id2 = 0;
      const id = requestAnimationFrame(() => (id2 = requestAnimationFrame(() => setShown(true))));
      return () => {
        cancelAnimationFrame(id);
        cancelAnimationFrame(id2);
      };
    }
    setShown(false);
    const t = setTimeout(() => setRender(false), SHEET_MS);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!render) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [render]);

  if (!render || typeof document === "undefined") return null;

  // drag-to-dismiss on the grabber/header
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { y0: e.clientY, t0: performance.now(), dy: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (panel.current) panel.current.style.transition = "none";
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !panel.current) return;
    const raw = e.clientY - d.y0;
    d.dy = raw > 0 ? raw : raw / 6; // rubber-band upwards
    panel.current.style.transform = `translateY(${d.dy}px)`;
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || !panel.current) return;
    panel.current.style.transition = "";
    panel.current.style.transform = "";
    const velocity = d.dy / Math.max(1, performance.now() - d.t0);
    if (d.dy > 110 || (d.dy > 24 && velocity > 0.6)) {
      haptic.impact("light");
      onClose();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="tg-sheet-backdrop absolute inset-0 bg-black/40" style={{ opacity: shown ? 1 : 0 }} onClick={onClose} />
      <div
        ref={panel}
        className="tg-sheet absolute inset-x-0 bottom-0 mx-auto flex max-h-[88dvh] max-w-[640px] flex-col rounded-t-[18px] bg-[var(--tg-secondary-bg)] shadow-[0_-8px_40px_rgba(0,0,0,0.25)]"
        style={{ transform: shown ? undefined : "translateY(100%)" }}
      >
        <div className="shrink-0 cursor-grab touch-none pb-1 pt-2" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <div className="mx-auto h-[5px] w-9 rounded-full bg-[var(--border-strong)]" />
          {title && <div className="px-4 pb-1 pt-3 text-center text-[17px] font-semibold">{title}</div>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(16px+var(--tg-safe-bottom))] pt-2">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------------- misc ---------------- */

export function Pill({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "danger" | "warning" | "success" | "accent" | "violet"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1 rounded-md px-1.5 text-[12px] font-medium",
        tone === "neutral" && "bg-muted text-muted-foreground",
        tone === "danger" && "bg-rose-500/12 text-rose-600 dark:text-rose-300",
        tone === "warning" && "bg-amber-500/14 text-amber-700 dark:text-amber-300",
        tone === "success" && "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
        tone === "accent" && "bg-[color-mix(in_srgb,var(--tg-button)_14%,transparent)] text-[var(--tg-link)]",
        tone === "violet" && "bg-violet-500/12 text-violet-700 dark:text-violet-300",
        className,
      )}
    >
      {children}
    </span>
  );
}
