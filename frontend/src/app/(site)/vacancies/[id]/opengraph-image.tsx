import { ImageResponse } from "next/og";
import { Brand, canvasStyle, OG_SIZE, ogFonts } from "@/lib/og";
import { fetchVacancy } from "@/lib/server-api";
import { realSalary } from "@/lib/seo";
import { FORMAT_LABEL, formatSalary, GRADE_LABEL } from "@/lib/utils";

export const alt = "Вакансия на JobRadar";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 3600;

/** Remote logos are inlined only when they are small PNG/JPEG files: anything else would break the render. */
async function logoData(url: string | null): Promise<string | null> {
  if (!url || !/^https:\/\//.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500), next: { revalidate: 86400 } });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(png|jpe?g)/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length < 400_000 ? `data:${type.split(";")[0]};base64,${buf.toString("base64")}` : null;
  } catch {
    return null;
  }
}

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await fetchVacancy(id).catch(() => null);
  const [fonts, logo] = await Promise.all([ogFonts(), logoData(v?.company.logo_url ?? null)]);

  if (!v) {
    return new ImageResponse(
      (
        <div style={canvasStyle}>
          <Brand size={52} />
          <div style={{ marginTop: "auto", fontSize: 64, fontWeight: 600, letterSpacing: -2 }}>IT-вакансии без дублей и воды</div>
        </div>
      ),
      { ...size, fonts },
    );
  }

  const salary = formatSalary({ ...v.salary, converted_from: null, converted_to: null });
  const estimated = !realSalary(v);
  const meta = [v.grade ? GRADE_LABEL[v.grade] : null, v.format ? FORMAT_LABEL[v.format] : null, v.city].filter(Boolean) as string[];
  const title = clip(v.title, 90);

  return new ImageResponse(
    (
      <div style={canvasStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Brand size={44} />
          <div style={{ display: "flex", fontSize: 22, color: "#8b8b98" }}>Вакансия</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, color: "#c4c4ce" }}>
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
              <img src={logo} width={52} height={52} style={{ borderRadius: 12, background: "#fff", objectFit: "contain" }} />
            )}
            {clip(v.company.name, 48)}
          </div>
          <div style={{ display: "flex", marginTop: 18, fontSize: title.length > 55 ? 56 : 68, fontWeight: 600, letterSpacing: -2, lineHeight: 1.08 }}>{title}</div>

          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 30 }}>
            {salary && (
              <div style={{ display: "flex", fontSize: 40, fontWeight: 600, color: estimated ? "#a1a1ad" : "#34d399" }}>
                {estimated ? `≈ ${salary}` : salary}
              </div>
            )}
            {meta.map((m) => (
              <div key={m} style={{ display: "flex", padding: "8px 16px", borderRadius: 12, background: "rgba(139,124,255,0.14)", border: "1px solid rgba(139,124,255,0.35)", fontSize: 24, color: "#d9d4ff" }}>
                {m}
              </div>
            ))}
          </div>

          {v.tags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 24 }}>
              {v.tags.slice(0, 7).map((t) => (
                <div key={t} style={{ display: "flex", padding: "6px 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)", fontSize: 21, color: "#b9b9c4" }}>
                  {t}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
