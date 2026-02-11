import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const enabled = Boolean(body.enabled);

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { advancedMode: enabled }
  });

  return NextResponse.json({ ok: true, advancedMode: user.advancedMode });
}
