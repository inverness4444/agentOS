import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/server/auth";
import {
  getCryptoNetworkAddress,
  isCryptoNetworkKey
} from "@/lib/billing/crypto";
import txService from "@/lib/admin/transactions.js";
import requestSecurity from "@/lib/security/request.js";

export const runtime = "nodejs";
const CRYPTO_USDT_TO_RUB_RATE = 80;
const { isSameOriginRequest } = requestSecurity as {
  isSameOriginRequest: (request: Request) => boolean;
};
const { createPendingTransaction } = txService as {
  createPendingTransaction: (input: {
    userId: string;
    type: string;
    amount: number;
    currency?: string;
    idempotencyKey?: string | null;
    metadata?: Record<string, unknown> | null;
  }) => Promise<{ id: string }>;
};

const isAdminUser = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });
  return ["SUPER_ADMIN"].includes(String(user?.role || "").toUpperCase());
};

const parseAmountFromNote = (note: string) => {
  const raw = String(note || "");
  const match =
    /amount_usdt\s*[:=]\s*([0-9]+(?:[.,][0-9]+)?)/i.exec(raw) ||
    /amount\s*[:=]\s*([0-9]+(?:[.,][0-9]+)?)/i.exec(raw) ||
    /([0-9]+(?:[.,][0-9]+)?)\s*usdt/i.exec(raw);
  if (!match) return 0;
  const value = Number(String(match[1]).replace(",", "."));
  return Number.isFinite(value) ? value : 0;
};

const parseAmountUsdt = (note: string, rawAmount: unknown) => {
  const fromBody = Number(rawAmount);
  if (Number.isFinite(fromBody) && fromBody > 0) {
    return Math.round(fromBody * 100) / 100;
  }
  const fromNote = parseAmountFromNote(note);
  return fromNote > 0 ? Math.round(fromNote * 100) / 100 : 0;
};

export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const scope = String(searchParams.get("scope") || "user").toLowerCase();
  const isAdmin = await isAdminUser(userId);

  if (scope === "admin") {
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const requests = await prisma.billingCryptoRequest.findMany({
      where: { status: "PENDING" },
      include: {
        user: { select: { id: true, email: true, name: true } },
        transaction: {
          select: { id: true, amount: true, currency: true, status: true, metadataJson: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    return NextResponse.json({ requests });
  }

  const requests = await prisma.billingCryptoRequest.findMany({
    where: { userId },
    include: {
      transaction: {
        select: { id: true, amount: true, currency: true, status: true, metadataJson: true }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return NextResponse.json({ requests, isAdmin });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const network = String(body.network || "").trim().toUpperCase();
  const txHash = String(body.txHash || "").trim();
  const note = String(body.note || "").trim();
  const amountUsdt = parseAmountUsdt(note, body.amount);
  const idempotencyFromHeader = String(request.headers.get("idempotency-key") || "").trim();
  const idempotencyFromBody = String(body.idempotencyKey || "").trim();

  if (!isCryptoNetworkKey(network)) {
    return NextResponse.json({ error: "network must be ERC20 or TRC20" }, { status: 400 });
  }

  const walletAddress = getCryptoNetworkAddress(network);
  if (!walletAddress) {
    return NextResponse.json({ error: "wallet not configured" }, { status: 500 });
  }

  if (amountUsdt <= 0) {
    return NextResponse.json({ error: "Укажите сумму пополнения в USDT." }, { status: 400 });
  }

  const recentPending = await prisma.billingCryptoRequest.findFirst({
    where: {
      userId,
      network,
      status: "PENDING"
    },
    orderBy: { createdAt: "desc" }
  });

  if (recentPending) {
    return NextResponse.json(
      {
        error: "У вас уже есть необработанная заявка по этой сети.",
        request: recentPending
      },
      { status: 409 }
    );
  }

  const transaction = await createPendingTransaction({
    userId,
    type: "CRYPTO_TOPUP",
    amount: amountUsdt,
    currency: "USDT",
    idempotencyKey:
      idempotencyFromBody ||
      idempotencyFromHeader ||
      `crypto_topup:${userId}:${network}:${amountUsdt}:${txHash || "nohash"}`,
    metadata: {
      amount_usdt: amountUsdt,
      exchange_rate_rub_per_usdt: CRYPTO_USDT_TO_RUB_RATE,
      expected_rub_amount: Math.round(amountUsdt * CRYPTO_USDT_TO_RUB_RATE * 100) / 100,
      network,
      walletAddress,
      txHash: txHash ? txHash.slice(0, 255) : null,
      note: note ? note.slice(0, 1000) : null
    }
  });

  const created = await prisma.billingCryptoRequest.create({
    data: {
      userId,
      transactionId: transaction.id,
      network,
      walletAddress,
      txHash: txHash ? txHash.slice(0, 255) : null,
      note: note ? note.slice(0, 1000) : null,
      status: "PENDING"
    }
  });

  return NextResponse.json({ ok: true, request: created });
}
