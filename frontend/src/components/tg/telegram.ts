"use client";

/* Typed, defensive wrapper around Telegram.WebApp (https://core.telegram.org/bots/webapps).
   Every call is feature-checked: older clients log noisy warnings (or do nothing) for unsupported methods. */

import { useEffect, useRef, useSyncExternalStore } from "react";

export type ColorScheme = "light" | "dark";
export type Insets = { top: number; bottom: number; left: number; right: number };

export interface ThemeParams {
  bg_color?: string;
  secondary_bg_color?: string;
  section_bg_color?: string;
  text_color?: string;
  hint_color?: string;
  subtitle_text_color?: string;
  link_color?: string;
  accent_text_color?: string;
  button_color?: string;
  button_text_color?: string;
  destructive_text_color?: string;
  section_header_text_color?: string;
  section_separator_color?: string;
  header_bg_color?: string;
  bottom_bar_bg_color?: string;
}

export interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
}

interface BottomButton {
  text: string;
  isVisible: boolean;
  isActive: boolean;
  isProgressVisible: boolean;
  setText(t: string): BottomButton;
  setParams(p: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean; has_shine_effect?: boolean; position?: string }): BottomButton;
  onClick(cb: () => void): BottomButton;
  offClick(cb: () => void): BottomButton;
  show(): BottomButton;
  hide(): BottomButton;
  enable(): BottomButton;
  disable(): BottomButton;
  showProgress(leaveActive?: boolean): BottomButton;
  hideProgress(): BottomButton;
}

type TgEvent = "themeChanged" | "viewportChanged" | "safeAreaChanged" | "contentSafeAreaChanged" | "activated" | "deactivated";

export interface WebApp {
  initData: string;
  initDataUnsafe: { user?: TgUser; start_param?: string; auth_date?: number; hash?: string };
  version: string;
  platform: string;
  colorScheme: ColorScheme;
  themeParams: ThemeParams;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  isVersionAtLeast(v: string): boolean;
  ready(): void;
  expand(): void;
  close(): void;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation?(): void;
  setHeaderColor(c: string): void;
  setBackgroundColor(c: string): void;
  setBottomBarColor?(c: string): void;
  onEvent(e: TgEvent, cb: () => void): void;
  offEvent(e: TgEvent, cb: () => void): void;
  openLink(url: string, opts?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  showConfirm?(message: string, cb: (ok: boolean) => void): void;
  showAlert?(message: string, cb?: () => void): void;
  requestWriteAccess?(cb?: (granted: boolean) => void): void;
  BackButton: { isVisible: boolean; show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  MainButton: BottomButton;
  SecondaryButton?: BottomButton;
  HapticFeedback: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
    selectionChanged(): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: WebApp };
  }
}

export function getWebApp(): WebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

const at = (wa: WebApp | null, v: string) => {
  try {
    return !!wa && wa.isVersionAtLeast(v);
  } catch {
    return false;
  }
};

/** A real Telegram client (not the SDK loaded in a plain browser, which reports platform "unknown"). */
export function isRealTelegram(wa: WebApp | null = getWebApp()) {
  return !!wa && wa.platform !== "unknown";
}

/** The SDK is loaded with `beforeInteractive`, which does not block hydration: wait for it (bounded). */
export function waitForWebApp(timeoutMs = 4000): Promise<WebApp | null> {
  const now = getWebApp();
  if (now) return Promise.resolve(now);
  return new Promise((resolve) => {
    const t0 = Date.now();
    const id = setInterval(() => {
      const wa = getWebApp();
      if (wa || Date.now() - t0 > timeoutMs) {
        clearInterval(id);
        resolve(wa);
      }
    }, 30);
  });
}

/* ---------------- haptics ---------------- */

export const haptic = {
  selection() {
    const wa = getWebApp();
    if (at(wa, "6.1")) wa!.HapticFeedback.selectionChanged();
  },
  impact(style: "light" | "medium" | "heavy" | "rigid" | "soft" = "light") {
    const wa = getWebApp();
    if (at(wa, "6.1")) wa!.HapticFeedback.impactOccurred(style);
  },
  notify(type: "error" | "success" | "warning") {
    const wa = getWebApp();
    if (at(wa, "6.1")) wa!.HapticFeedback.notificationOccurred(type);
  },
};

/* ---------------- links & dialogs ---------------- */

export function openLink(url: string) {
  const wa = getWebApp();
  if (isRealTelegram(wa)) wa!.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

export function openTelegramLink(url: string) {
  const wa = getWebApp();
  if (isRealTelegram(wa) && at(wa, "6.1")) wa!.openTelegramLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

export function confirmDialog(message: string): Promise<boolean> {
  const wa = getWebApp();
  if (isRealTelegram(wa) && at(wa, "6.2") && wa!.showConfirm) {
    return new Promise((resolve) => wa!.showConfirm!(message, (ok) => resolve(!!ok)));
  }
  return Promise.resolve(window.confirm(message));
}

export function requestWriteAccess(): Promise<boolean | null> {
  const wa = getWebApp();
  if (!isRealTelegram(wa) || !at(wa, "6.9") || !wa!.requestWriteAccess) return Promise.resolve(null);
  return new Promise((resolve) => wa!.requestWriteAccess!((granted) => resolve(!!granted)));
}

/* ---------------- one-time app setup ---------------- */

const PAGE_COLOR = "secondary_bg_color";

export function applyChrome(wa: WebApp) {
  const dark = wa.colorScheme === "dark";
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  // mirror theme params as CSS vars (the SDK does this too; this also covers SDK-less previews and old clients)
  for (const [k, v] of Object.entries(wa.themeParams ?? {})) {
    if (typeof v === "string") root.style.setProperty(`--tg-theme-${k.replace(/_/g, "-")}`, v);
  }
  const insets = (name: string, i?: Insets) => {
    if (!i) return;
    for (const side of ["top", "bottom", "left", "right"] as const) root.style.setProperty(`--tg-${name}-${side}`, `${i[side] ?? 0}px`);
  };
  insets("safe-area-inset", wa.safeAreaInset);
  insets("content-safe-area-inset", wa.contentSafeAreaInset);
  try {
    if (at(wa, "6.1")) {
      wa.setHeaderColor(PAGE_COLOR);
      wa.setBackgroundColor(PAGE_COLOR);
    }
    if (at(wa, "7.10") && wa.setBottomBarColor) wa.setBottomBarColor(PAGE_COLOR);
  } catch {}
}

export function initWebApp(wa: WebApp) {
  try {
    wa.ready();
    wa.expand();
    if (at(wa, "7.7") && wa.disableVerticalSwipes) wa.disableVerticalSwipes();
  } catch {}
  applyChrome(wa);
  const onTheme = () => {
    applyChrome(wa);
    emit();
  };
  wa.onEvent("themeChanged", onTheme);
  wa.onEvent("safeAreaChanged", onTheme);
  wa.onEvent("contentSafeAreaChanged", onTheme);
}

/* ---------------- reactive snapshot (theme / user) ---------------- */

const listeners = new Set<() => void>();
function emit() {
  version++;
  listeners.forEach((l) => l());
}
let version = 0;
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function notifyWebAppReady() {
  emit();
}

export function useTelegram() {
  const v = useSyncExternalStore(
    subscribe,
    () => version,
    () => -1,
  );
  // -1 = server render / hydration pass: behave exactly like the server to avoid hydration mismatches
  const wa = v === -1 ? null : getWebApp();
  return {
    wa,
    inTelegram: isRealTelegram(wa),
    colorScheme: (wa?.colorScheme ?? "light") as ColorScheme,
    themeParams: wa?.themeParams ?? {},
    user: wa?.initDataUnsafe?.user ?? null,
    startParam: wa?.initDataUnsafe?.start_param ?? null,
    initData: wa?.initData ?? "",
    safeArea: wa?.safeAreaInset ?? null,
    contentSafeArea: wa?.contentSafeAreaInset ?? null,
  };
}

/* ---------------- BackButton (stack: the top-most screen/sheet owns it) ---------------- */

const backStack: { id: number; cb: () => void }[] = [];
let backSeq = 0;
const backListeners = new Set<() => void>();
const onNativeBack = () => backStack[backStack.length - 1]?.cb();
let nativeBound = false;

function syncBack() {
  const wa = getWebApp();
  if (wa && at(wa, "6.1")) {
    if (!nativeBound) {
      wa.BackButton.onClick(onNativeBack);
      nativeBound = true;
    }
    if (backStack.length) wa.BackButton.show();
    else wa.BackButton.hide();
  }
  backListeners.forEach((l) => l());
}

/** Shows Telegram's BackButton while mounted (and `enabled`); the latest registration wins. */
export function useBackButton(cb: (() => void) | null) {
  const ref = useRef(cb);
  ref.current = cb;
  const enabled = !!cb;
  useEffect(() => {
    if (!enabled) return;
    const entry = { id: ++backSeq, cb: () => ref.current?.() };
    backStack.push(entry);
    syncBack();
    return () => {
      const i = backStack.findIndex((e) => e.id === entry.id);
      if (i >= 0) backStack.splice(i, 1);
      syncBack();
    };
  }, [enabled]);
}

/* ---------------- MainButton ---------------- */

export interface MainButtonOpts {
  text: string;
  visible: boolean;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** "primary" uses theme button colors; "secondary" is a quieter style for done/confirmed states */
  tone?: "primary" | "secondary";
}

/** Drives Telegram's native MainButton. Returns `fallback=true` when not inside a real client (render an HTML button). */
export function useMainButton({ text, visible, onClick, loading, disabled, tone = "primary" }: MainButtonOpts) {
  const ref = useRef(onClick);
  ref.current = onClick;
  const wa = getWebApp();
  const native = isRealTelegram(wa);

  useEffect(() => {
    if (!native || !wa) return;
    const handler = () => {
      if (!wa.MainButton.isProgressVisible) ref.current();
    };
    wa.MainButton.onClick(handler);
    return () => {
      wa.MainButton.offClick(handler);
    };
  }, [native, wa]);

  useEffect(() => {
    if (!native || !wa) return;
    const tp = wa.themeParams ?? {};
    const color = tone === "secondary" ? tp.section_bg_color ?? tp.bg_color : tp.button_color;
    const textColor = tone === "secondary" ? tp.button_color ?? tp.link_color : tp.button_text_color;
    wa.MainButton.setParams({
      text,
      is_visible: visible,
      is_active: !disabled,
      ...(color ? { color } : {}),
      ...(textColor ? { text_color: textColor } : {}),
    });
    if (loading) wa.MainButton.showProgress(false);
    else wa.MainButton.hideProgress();
  }, [native, wa, text, visible, loading, disabled, tone]);

  useEffect(() => {
    if (!native || !wa) return;
    return () => {
      wa.MainButton.hideProgress();
      wa.MainButton.hide();
    };
  }, [native, wa]);

  return { fallback: !native };
}
