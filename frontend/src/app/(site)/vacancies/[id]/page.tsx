import { VacancyDetailPage } from "@/components/vacancy/detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VacancyDetailPage id={id} />;
}
