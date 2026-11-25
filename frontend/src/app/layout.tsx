import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "JobRadar — умный агрегатор IT-вакансий",
  description: "Вакансии с hh.ru, Habr Карьеры и Telegram в одной ленте: дедупликация, AI-саммари, match score и детектор вечных вакансий.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className="dark" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} min-h-dvh font-sans antialiased`}>
        <Providers>
          <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[520px] glow-top" />
          <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[520px] bg-grid" />
          <Nav />
          <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6 md:pb-16">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
