import { notFound } from "next/navigation";
import { VacancyScreen } from "@/components/tg/vacancy-screen";

export default async function TgVacancyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) notFound();
  // key: a fresh screen (state, MainButton, BackButton) per vacancy when hopping between them
  return <VacancyScreen key={id} id={id} />;
}
