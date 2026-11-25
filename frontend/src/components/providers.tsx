"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { useState } from "react";
import { TooltipProvider } from "@/components/ui/primitives";
import { useTheme } from "next-themes";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={(resolvedTheme as "dark" | "light") ?? "dark"}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "!rounded-xl !border !border-border !bg-elevated !text-foreground !shadow-2xl !shadow-black/30",
          description: "!text-muted-foreground",
        },
      }}
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <TooltipProvider delayDuration={120}>
          {children}
          <ThemedToaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
