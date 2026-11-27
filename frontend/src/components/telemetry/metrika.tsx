"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { hit, YM_ID } from "@/lib/analytics";

/* Yandex Metrika (only when NEXT_PUBLIC_YM_ID is set): webvisor off, clickmap + link tracking on.
   `defer: true` disables the automatic first hit, so every page view (including the first one) is
   reported from the route listener below — that is how SPA navigations get counted. */

function RouteHits() {
  const pathname = usePathname();
  const search = useSearchParams();
  const prev = useRef<string | null>(null);
  useEffect(() => {
    const qs = search.toString();
    // never leak one-time secrets (password reset tokens) to analytics
    const url = `${window.location.origin}${pathname}${qs && !pathname.startsWith("/reset-password") ? `?${qs}` : ""}`;
    if (url === prev.current) return;
    hit(url, prev.current ?? (document.referrer || undefined));
    prev.current = url;
  }, [pathname, search]);
  return null;
}

const TAG = (id: number) => `(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");
ym(${id},"init",{defer:true,clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:false});`;

export function Metrika() {
  if (!YM_ID) return null;
  return (
    <>
      <Script id="ym-tag" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: TAG(YM_ID) }} />
      <noscript>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://mc.yandex.ru/watch/${YM_ID}`} style={{ position: "absolute", left: "-9999px" }} alt="" />
        </div>
      </noscript>
      <Suspense fallback={null}>
        <RouteHits />
      </Suspense>
    </>
  );
}
