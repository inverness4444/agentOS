import { renderAdminSection } from "@/app/(app)/admin/_shared/renderAdminSection";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminTransactionsPage() {
  return renderAdminSection("transactions");
}
