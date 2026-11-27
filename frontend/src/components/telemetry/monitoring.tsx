"use client";

import { useEffect } from "react";
import { loadSentry } from "@/lib/monitoring";

/** Initialises Sentry after hydration (no-op without NEXT_PUBLIC_SENTRY_DSN); it then reports unhandled errors. */
export function Monitoring() {
  useEffect(() => {
    void loadSentry();
  }, []);
  return null;
}
