"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Format, MarketAnalytics } from "@/lib/types";
import { FORMAT_LABEL, formatMoney } from "@/lib/utils";

/* ---------------- tooltip ---------------- */

type TipPayload = { value?: number | string; name?: string | number; payload?: Record<string, unknown>; color?: string };

function ChartTooltip({
  active,
  payload,
  label,
  render,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TipPayload>;
  label?: string | number;
  render: (p: TipPayload, label?: string | number) => React.ReactNode;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border bg-elevated px-3 py-2 text-[12.5px] shadow-2xl shadow-black/30">{render(payload[0], label)}</div>
  );
}

const axisTick = { fill: "var(--muted-foreground)", fontSize: 11.5 };

/* ---------------- top skills ---------------- */

export function TopSkillsChart({ data }: { data: MarketAnalytics["top_skills"] }) {
  const id = useId().replace(/:/g, "");
  const rows = [...data].sort((a, b) => b.count - a.count).slice(0, 10);
  return (
    <div style={{ height: Math.max(rows.length * 34 + 16, 200) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 118, bottom: 4, left: 0 }} barCategoryGap={7}>
          <defs>
            <linearGradient id={`skills-${id}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#8b7cff" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="skill"
            width={96}
            tickLine={false}
            axisLine={false}
            tick={{ ...axisTick, fill: "var(--foreground)", fontSize: 12.5 }}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={
              <ChartTooltip
                render={(p) => {
                  const row = p.payload as { skill: string; count: number; median_salary_rub: number | null };
                  return (
                    <div>
                      <div className="font-medium">{row.skill}</div>
                      <div className="text-muted-foreground">{row.count.toLocaleString("ru-RU")} вакансий</div>
                      {row.median_salary_rub != null && (
                        <div className="text-muted-foreground">медиана {formatMoney(row.median_salary_rub, "RUB")}</div>
                      )}
                    </div>
                  );
                }}
              />
            }
          />
          <Bar dataKey="count" fill={`url(#skills-${id})`} radius={[4, 6, 6, 4]} animationDuration={900}>
            <LabelList
              dataKey="count"
              content={(props) => {
                const x = Number(props.x ?? 0);
                const y = Number(props.y ?? 0);
                const w = Number(props.width ?? 0);
                const h = Number(props.height ?? 0);
                const row = rows[Number(props.index ?? 0)];
                if (!row) return null;
                return (
                  <g>
                    <text x={x + w + 8} y={y + h / 2} dominantBaseline="central" fontSize={12} fill="var(--foreground)" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {row.count.toLocaleString("ru-RU")}
                      {row.median_salary_rub != null && (
                        <tspan fill="var(--muted-foreground)" fontSize={11.5}>
                          {"  · "}
                          {formatMoney(row.median_salary_rub, "RUB", true)}
                        </tspan>
                      )}
                    </text>
                  </g>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------- trend ---------------- */

export function TrendChart({ data }: { data: MarketAnalytics["trend"] }) {
  const id = useId().replace(/:/g, "");
  const fmtDate = (d: string | number) => {
    const dt = new Date(String(d));
    return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  };
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id={`trend-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b7cff" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#8b7cff" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`trend-line-${id}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#8b7cff" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            minTickGap={28}
            tickMargin={8}
          />
          <YAxis tickLine={false} axisLine={false} tick={axisTick} width={48} />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            content={
              <ChartTooltip
                render={(p, label) => (
                  <div>
                    <div className="text-muted-foreground">{label != null ? fmtDate(label) : ""}</div>
                    <div className="font-medium tabular-nums">{Number(p.value ?? 0).toLocaleString("ru-RU")} новых вакансий</div>
                  </div>
                )}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke={`url(#trend-line-${id})`}
            strokeWidth={2.2}
            fill={`url(#trend-${id})`}
            activeDot={{ r: 4, fill: "#8b7cff", stroke: "var(--background)", strokeWidth: 2 }}
            animationDuration={1000}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------- format donut ---------------- */

const FORMAT_COLORS: Record<string, string> = { remote: "#8b7cff", hybrid: "#22d3ee", office: "#f472b6" };

export function FormatDonut({ data }: { data: MarketAnalytics["by_format"] }) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const rows = data.map((d) => ({ ...d, name: FORMAT_LABEL[d.format as Format] ?? ((d.format as string) === "unknown" ? "Не указан" : d.format) }));
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative h-[170px] w-[170px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="count"
              nameKey="name"
              innerRadius={56}
              outerRadius={80}
              paddingAngle={3}
              cornerRadius={5}
              stroke="none"
              animationDuration={900}
            >
              {rows.map((r) => (
                <Cell key={r.format} fill={FORMAT_COLORS[r.format] ?? "#a1a1aa"} />
              ))}
            </Pie>
            <Tooltip
              content={
                <ChartTooltip
                  render={(p) => (
                    <div>
                      <div className="font-medium">{String(p.name)}</div>
                      <div className="tabular-nums text-muted-foreground">
                        {Number(p.value ?? 0).toLocaleString("ru-RU")} · {Math.round((Number(p.value ?? 0) / total) * 100)}%
                      </div>
                    </div>
                  )}
                />
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-[20px] font-semibold tabular-nums leading-none">{total.toLocaleString("ru-RU")}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">вакансий</div>
          </div>
        </div>
      </div>
      <div className="w-full space-y-2.5">
        {rows.map((r) => {
          const pct = Math.round((r.count / total) * 100);
          return (
            <div key={r.format} className="flex items-center gap-3 text-[13px]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: FORMAT_COLORS[r.format] ?? "#a1a1aa" }} />
              <span className="flex-1">{r.name}</span>
              <span className="tabular-nums text-muted-foreground">{r.count.toLocaleString("ru-RU")}</span>
              <span className="w-10 text-right font-medium tabular-nums">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
