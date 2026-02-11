import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AdminPanel from "@/components/admin/AdminPanel";

export type AdminTab = "users" | "topups" | "transactions";

export async function renderAdminSection(initialTab: AdminTab) {
  noStore();

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect(`/login?from=/admin/${initialTab}`);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, status: true }
  });

  if (!user || user.role !== "SUPER_ADMIN" || user.status !== "ACTIVE") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-soft">
        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">AgentOS</div>
        <h1 className="mt-2 text-2xl font-semibold text-black">Супер-админ</h1>
      </div>

      <AdminPanel initialTab={initialTab} />
    </div>
  );
}
