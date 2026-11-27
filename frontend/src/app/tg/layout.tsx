import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { TgShell } from "@/components/tg/shell";
import "./tg.css";

export const metadata: Metadata = {
  title: { absolute: "JobRadar" },
  description: "IT-вакансии с Habr Карьеры, GeekJob, DevKG и Telegram — с match score, AI-саммари и трекером откликов.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/* Runs during HTML parsing, before first paint: applies the Telegram theme passed in the launch URL hash
   (or remembered in sessionStorage by the SDK) so light-theme users never see a dark flash. */
const EARLY_THEME = `(function(){try{
var d=document.documentElement;d.classList.add('tg');
var tp=null,m=location.hash.match(/[#&]tgWebAppThemeParams=([^&]*)/);
if(m){tp=JSON.parse(decodeURIComponent(m[1]));}
if(!tp){var s=sessionStorage.getItem('__telegram__themeParams');if(s){tp=JSON.parse(s);}}
var dark;
if(tp&&typeof tp==='object'){for(var k in tp){if(typeof tp[k]==='string'&&/^#[0-9a-f]{3,8}$/i.test(tp[k])){d.style.setProperty('--tg-theme-'+k.replace(/_/g,'-'),tp[k]);}}
var bg=tp.bg_color;if(bg&&/^#[0-9a-f]{6}$/i.test(bg)){var r=parseInt(bg.substr(1,2),16),g=parseInt(bg.substr(3,2),16),b=parseInt(bg.substr(5,2),16);dark=Math.sqrt(0.299*r*r+0.587*g*g+0.114*b*b)<120;}}
if(dark===undefined){dark=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches;}
d.classList.toggle('dark',!!dark);d.style.colorScheme=dark?'dark':'light';
}catch(e){}})();`;

export default function TgLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <script dangerouslySetInnerHTML={{ __html: EARLY_THEME }} />
      <TgShell>{children}</TgShell>
    </>
  );
}
