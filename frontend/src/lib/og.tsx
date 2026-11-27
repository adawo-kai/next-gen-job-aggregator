/* Shared pieces for next/og images (server only). Fonts are read from public/fonts: the default
   next/og font has no Cyrillic glyphs. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const OG_SIZE = { width: 1200, height: 630 };

let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 600; style: "normal" }[]> | null = null;
export function ogFonts() {
  if (!fonts) {
    const dir = join(process.cwd(), "public", "fonts");
    fonts = Promise.all([readFile(join(dir, "Geist-Regular.ttf")), readFile(join(dir, "Geist-SemiBold.ttf"))]).then(([r, s]) => [
      { name: "Geist", data: r, weight: 400 as const, style: "normal" as const },
      { name: "Geist", data: s, weight: 600 as const, style: "normal" as const },
    ]);
    fonts.catch(() => (fonts = null));
  }
  return fonts;
}

const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M12 12 L19 5"/><path d="M4.5 16.5a8.5 8.5 0 1 1 15 0" opacity=".55"/><path d="M8 15a4.5 4.5 0 1 1 8 0"/><circle cx="12" cy="12" r="1.3" fill="#fff" stroke="none"/></svg>`;
export const MARK_URI = `data:image/svg+xml;base64,${Buffer.from(MARK).toString("base64")}`;

export function LogoMark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        background: "linear-gradient(135deg, #8b7cff, #22d3ee)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img src={MARK_URI} width={size * 0.6} height={size * 0.6} />
    </div>
  );
}

export function Brand({ size = 44 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <LogoMark size={size} />
      <div style={{ display: "flex", fontSize: size * 0.72, fontWeight: 600, letterSpacing: -0.5 }}>
        <span style={{ color: "#ededf0" }}>Job</span>
        <span style={{ color: "#8b8b98" }}>Radar</span>
      </div>
    </div>
  );
}

/** Dark canvas with the site's violet/cyan glow. */
export const canvasStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  background: "#07070a",
  backgroundImage: "radial-gradient(circle at 85% -10%, rgba(124,108,255,0.45), transparent 55%), radial-gradient(circle at 0% 110%, rgba(34,211,238,0.22), transparent 50%)",
  color: "#ededf0",
  fontFamily: "Geist",
  padding: "64px 72px",
};
