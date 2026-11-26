import { NextRequest, NextResponse } from "next/server";
import {
  ACTIVATION_AMOUNT_KOBO,
  ACTIVATION_AMOUNT_NGN,
  grantChannelActivation,
} from "@/lib/paystack-activation";

export async function GET(req: NextRequest) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json(
      { error: "PAYSTACK_SECRET_KEY is not configured" },
      { status: 500 }
    );
  }

  const reference =
    req.nextUrl.searchParams.get("reference") ||
    req.nextUrl.searchParams.get("trxref") ||
    "";
  const fallbackUserId = req.nextUrl.searchParams.get("userId") || "";

  if (!reference) {
    return NextResponse.json({ error: "Missing transaction reference" }, { status: 400 });
  }

  const verifyRes = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );

  const verifyJson = await verifyRes.json().catch(() => ({}));
  const tx = verifyJson?.data;

  if (!verifyRes.ok || !verifyJson?.status || tx?.status !== "success") {
    return NextResponse.json(
      { ok: false, error: tx?.gateway_response || "Payment not successful yet" },
      { status: 400 }
    );
  }

  if (tx.currency !== "NGN" || Number(tx.amount) < ACTIVATION_AMOUNT_KOBO) {
    return NextResponse.json(
      { ok: false, error: "Invalid payment currency or amount (requires ₦30,000 NGN)" },
      { status: 400 }
    );
  }

  const meta = tx.metadata || {};
  const userId = String(meta.user_id || fallbackUserId || "").trim();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "Payment verified, but user_id was missing from metadata" },
      { status: 400 }
    );
  }

  try {
    await grantChannelActivation({
      userId,
      reference: String(tx.reference || reference),
      amountNgn: Math.max(ACTIVATION_AMOUNT_NGN, Math.round(Number(tx.amount) / 100)),
      channelName: typeof meta.channel_name === "string" ? meta.channel_name : undefined,
      category: typeof meta.category === "string" ? meta.category : undefined,
      description: typeof meta.description === "string" ? meta.description : undefined,
      channelLogoUrl: typeof meta.channel_logo_url === "string" ? meta.channel_logo_url : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database activation failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    reference: tx.reference || reference,
    userId,
  });
}
