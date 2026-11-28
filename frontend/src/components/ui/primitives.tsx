"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./button-class";

export { buttonClass };

/* ---------------- Button ---------------- */

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={buttonClass({ variant, size, className })}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});

/* ---------------- Card ---------------- */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "card-sheen rounded-2xl border bg-card text-card-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, title, description, icon, action }: { className?: string; title: React.ReactNode; description?: React.ReactNode; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-5 pt-5", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground ring-1 ring-inset ring-border">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ---------------- Badge ---------------- */

type BadgeTone = "default" | "primary" | "success" | "warning" | "danger" | "info" | "outline";
const toneCls: Record<BadgeTone, string> = {
  default: "bg-muted text-muted-foreground ring-border",
  primary: "bg-primary/10 text-primary ring-primary/25",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/25",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-300 ring-amber-500/25",
  danger: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/25",
  info: "bg-sky-500/10 text-sky-600 dark:text-sky-300 ring-sky-500/25",
  outline: "bg-transparent text-muted-foreground ring-border-strong",
};

export function Badge({ className, tone = "default", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset",
        toneCls[tone],
        className,
      )}
      {...props}
    />
  );
}

/* ---------------- Chip (toggle) ---------------- */

export function Chip({ active, className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "touch-hit inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium ring-1 ring-inset transition-all duration-150",
        active
          ? "bg-primary/12 text-foreground ring-primary/45 shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_10%,transparent)]"
          : "bg-transparent text-muted-foreground ring-border hover:text-foreground hover:ring-border-strong",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ---------------- Input / Textarea / Select ---------------- */

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-lg bg-muted/50 px-3 text-sm ring-1 ring-inset ring-input outline-none transition-shadow placeholder:text-muted-foreground/70 focus:bg-transparent focus:ring-2 focus:ring-ring",
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-lg bg-muted/50 px-3 py-2 text-sm ring-1 ring-inset ring-input outline-none transition-shadow placeholder:text-muted-foreground/70 focus:bg-transparent focus:ring-2 focus:ring-ring scrollbar-thin",
        className,
      )}
      {...props}
    />
  );
});

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 cursor-pointer rounded-lg bg-muted/50 px-2.5 text-sm ring-1 ring-inset ring-input outline-none focus:ring-2 focus:ring-ring [&>option]:bg-elevated",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[12.5px] font-medium text-muted-foreground", className)} {...props} />;
}

/* ---------------- Switch ---------------- */

export function Switch({ checked, onCheckedChange, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; id?: string }) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-muted ring-1 ring-inset ring-border-strong transition-colors data-[state=checked]:bg-primary data-[state=checked]:ring-primary"
    >
      <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-200 data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  );
}

/* ---------------- Tooltip ---------------- */

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({ content, children, side = "top", className }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right"; className?: string }) {
  return (
    <TooltipPrimitive.Root delayDuration={120}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-[100] max-w-xs rounded-lg border bg-elevated px-3 py-2 text-[12.5px] leading-relaxed text-foreground shadow-xl shadow-black/20 data-[state=delayed-open]:animate-in",
            className,
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/* ---------------- Skeleton ---------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} />;
}

/* ---------------- Empty state ---------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  titleAs: Title = "h3",
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** "h1" when the empty state is the whole page (e.g. a protected page for a signed-out visitor) */
  titleAs?: "h1" | "h2" | "h3";
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-16 text-center", className)}>
      <div className="relative mb-4 grid h-12 w-12 place-items-center rounded-xl bg-muted text-muted-foreground ring-1 ring-inset ring-border">
        <div className="absolute inset-0 -z-10 rounded-xl bg-primary/20 blur-xl" />
        {icon}
      </div>
      <Title className="text-[15px] font-semibold">{title}</Title>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ---------------- Section title ---------------- */

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded border border-border-strong bg-muted px-1 font-mono text-[10.5px] text-muted-foreground", className)}>
      {children}
    </kbd>
  );
}
