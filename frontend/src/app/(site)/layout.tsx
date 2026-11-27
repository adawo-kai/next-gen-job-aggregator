import { SiteProviders } from "@/components/site-providers";
import { Nav } from "@/components/nav";

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SiteProviders>
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[520px] glow-top" />
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[520px] bg-grid" />
      <Nav />
      <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6 md:pb-16">{children}</main>
    </SiteProviders>
  );
}
