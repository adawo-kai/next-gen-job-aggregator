/* Sentry, only when NEXT_PUBLIC_SENTRY_DSN is set. The SDK is imported dynamically, so builds without a
   DSN never download it. No PII: default PII is off, IPs/user fields are stripped, one-time tokens in
   URLs (password reset links) are redacted. */

type SentryModule = typeof import("@sentry/browser");

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || "";
let loading: Promise<SentryModule | null> | null = null;

const redact = (s?: string) => s?.replace(/([?&#](token|access_token|refresh_token|tgWebAppData)=)[^&#\s]+/gi, "$1[redacted]");

export function loadSentry(): Promise<SentryModule | null> {
  if (!DSN || typeof window === "undefined") return Promise.resolve(null);
  if (!loading) {
    loading = import("@sentry/browser")
      .then((S) => {
        S.init({
          dsn: DSN,
          environment: process.env.NODE_ENV,
          sendDefaultPii: false,
          tracesSampleRate: 0.05,
          integrations: [S.browserTracingIntegration()],
          // Telegram's SDK, browser extensions and aborted fetches are noise, not bugs
          ignoreErrors: ["ResizeObserver loop", "AbortError", "Non-Error promise rejection captured", "Load failed", "Failed to fetch"],
          denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i],
          beforeSend(event) {
            delete event.user;
            if (event.request) {
              event.request.url = redact(event.request.url);
              delete event.request.cookies;
              if (event.request.headers) delete event.request.headers.Authorization;
            }
            return event;
          },
          beforeBreadcrumb(b) {
            if (b.data && typeof b.data.url === "string") b.data.url = redact(b.data.url);
            if (b.data && typeof b.data.to === "string") b.data.to = redact(b.data.to);
            if (b.data && typeof b.data.from === "string") b.data.from = redact(b.data.from);
            if (b.category === "console") return null;
            return b;
          },
        });
        return S;
      })
      .catch(() => null);
  }
  return loading;
}

export function reportError(error: unknown, extra?: Record<string, unknown>) {
  void loadSentry().then((S) => S?.captureException(error, extra ? { extra } : undefined));
}
