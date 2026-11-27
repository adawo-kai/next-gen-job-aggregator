import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Аналитика рынка IT-вакансий",
  description: "Зарплаты по грейдам, самые востребованные навыки, динамика публикаций и источники IT-вакансий — обновляется каждый час.",
  alternates: { canonical: "/analytics" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
