"use client";

import { cn } from "@/lib/utils";
import { useMainButton, type MainButtonOpts } from "./telegram";
import { Button } from "./ui";

/** Telegram's native MainButton; outside a real client (browser preview) renders an equivalent HTML bar. */
export function MainButton(props: MainButtonOpts & { aboveTabs?: boolean }) {
  const { fallback } = useMainButton(props);
  if (!fallback || !props.visible) return null;
  return (
    <div
      className={cn("fixed inset-x-0 z-40 bg-[color-mix(in_srgb,var(--tg-secondary-bg)_92%,transparent)] px-3 pt-2 backdrop-blur-xl")}
      style={{
        bottom: props.aboveTabs ? "calc(var(--tg-tabbar-h) + var(--tg-safe-bottom))" : 0,
        paddingBottom: props.aboveTabs ? 8 : "calc(var(--tg-safe-bottom) + 8px)",
      }}
    >
      <Button
        size="lg"
        className={cn("mx-auto flex w-full max-w-[616px]", props.tone === "secondary" && "bg-card text-[var(--tg-link)]")}
        loading={props.loading}
        disabled={props.disabled}
        onClick={props.onClick}
      >
        {props.text}
      </Button>
    </div>
  );
}
