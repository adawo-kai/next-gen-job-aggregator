/* Button styles without "use client": usable from server components too (e.g. a Link styled as a button). */
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

const variantCls: Record<ButtonVariant, string> = {
  primary:
    "bg-foreground text-background hover:bg-foreground/90 shadow-[0_1px_0_0_rgba(255,255,255,0.15)_inset,0_8px_24px_-8px_var(--glow)]",
  secondary: "bg-muted text-foreground hover:bg-muted/70 ring-1 ring-inset ring-border",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-muted",
  outline: "ring-1 ring-inset ring-border-strong text-foreground hover:bg-muted",
  danger: "bg-rose-500/10 text-rose-500 dark:text-rose-400 ring-1 ring-inset ring-rose-500/25 hover:bg-rose-500/15",
};
const sizeCls: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-9 px-4 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-xl",
  icon: "h-9 w-9 rounded-lg",
  "icon-sm": "h-7 w-7 rounded-md",
};

const buttonBase =
  "inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-[background,color,box-shadow,transform] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer";

/** Button styles for elements that are not a <button> (e.g. a Link): never nest a <button> inside an <a>. */
export function buttonClass({ variant = "primary", size = "md", className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(buttonBase, variantCls[variant], sizeCls[size], className);
}
