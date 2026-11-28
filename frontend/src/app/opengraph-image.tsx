import { ImageResponse } from "next/og";
import { Brand, canvasStyle, OG_SIZE, ogFonts } from "@/lib/og";

export const alt = "JobRadar — умный агрегатор IT-вакансий";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  const features = ["Без дублей", "Коротко о вакансии", "Совпадение с резюме", "Детектор вечных вакансий"];
  return new ImageResponse(
    (
      <div style={canvasStyle}>
        <Brand size={52} />
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
          <div style={{ fontSize: 76, fontWeight: 600, letterSpacing: -2.5, lineHeight: 1.05 }}>Все IT-вакансии.</div>
          <div
            style={{
              fontSize: 76,
              fontWeight: 600,
              letterSpacing: -2.5,
              lineHeight: 1.05,
              backgroundImage: "linear-gradient(92deg, #a594ff 0%, #6d5cff 40%, #22d3ee 100%)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Без дублей и воды.
          </div>
          <div style={{ marginTop: 26, fontSize: 28, color: "#a1a1ad" }}>Habr Карьера · GeekJob · DevKG · Telegram — в одной ленте</div>
          <div style={{ display: "flex", gap: 12, marginTop: 34 }}>
            {features.map((f) => (
              <div key={f} style={{ display: "flex", padding: "10px 18px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)", fontSize: 22, color: "#d4d4dc" }}>
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
