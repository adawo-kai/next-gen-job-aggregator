import { SiteProviders } from "@/components/site-providers";
import { Nav } from "@/components/nav";
import { SiteFooter } from "@/components/footer";
import { Metrika } from "@/components/telemetry/metrika";
import { CookieNotice } from "@/components/telemetry/cookie-notice";

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SiteProviders>
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[520px] glow-top" />
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[520px] bg-grid" />
      <div className="flex min-h-dvh flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12 pt-6 sm:px-6 md:pb-16">{children}</main>
        <SiteFooter />
      </div>
      <CookieNotice />
      <Metrika />
    </SiteProviders>
  );
}
