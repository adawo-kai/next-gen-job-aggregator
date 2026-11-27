import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Трекер откликов",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
