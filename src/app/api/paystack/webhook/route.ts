import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  ACTIVATION_AMOUNT_KOBO,
  ACTIVATION_AMOUNT_NGN,
  grantChannelActivation,
} from "@/lib/paystack-activation";

export async function POST(req: NextRequest) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "PAYSTACK_SECRET_KEY not set" }, { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature") || "";
  const expectedSig = crypto
    .createHmac("sha512", secretKey)
    .update(rawBody)
    .digest("hex");

  if (!signature || signature !== expectedSig) {
    return NextResponse.json({ error: "Invalid Paystack signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  if (event?.event === "charge.success") {
    const tx = event.data || {};
    const meta = tx.metadata || {};
    const userId = String(meta.user_id || "").trim();
    const reference = String(tx.reference || "").trim();

    if (
      userId &&
      reference &&
      tx.currency === "NGN" &&
      Number(tx.amount) >= ACTIVATION_AMOUNT_KOBO
    ) {
      await grantChannelActivation({
        userId,
        reference,
        amountNgn: Math.max(ACTIVATION_AMOUNT_NGN, Math.round(Number(tx.amount) / 100)),
        channelName: typeof meta.channel_name === "string" ? meta.channel_name : undefined,
        category: typeof meta.category === "string" ? meta.category : undefined,
        description: typeof meta.description === "string" ? meta.description : undefined,
        channelLogoUrl: typeof meta.channel_logo_url === "string" ? meta.channel_logo_url : null,
      });
    }
  }

  return NextResponse.json({ received: true });
}
