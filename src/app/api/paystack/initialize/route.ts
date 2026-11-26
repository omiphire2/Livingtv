import { NextRequest, NextResponse } from "next/server";
import {
  ACTIVATION_AMOUNT_KOBO,
  ACTIVATION_AMOUNT_NGN,
  getSupabaseAdmin,
} from "@/lib/paystack-activation";

export async function POST(req: NextRequest) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json(
      { error: "PAYSTACK_SECRET_KEY is not configured" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const callbackUrl =
    typeof body.callbackUrl === "string" && body.callbackUrl.startsWith("http")
      ? body.callbackUrl
      : `${req.nextUrl.origin}/studio`;

  if (!userId || !email) {
    return NextResponse.json(
      { error: "Missing userId or email for Paystack checkout" },
      { status: 400 }
    );
  }

  const reference = `LTV-30K-${userId.slice(0, 8)}-${Date.now()}`;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin.from("transactions").insert({
      user_id: userId,
      reference,
      amount_ngn: ACTIVATION_AMOUNT_NGN,
      purpose: "channel_activation",
      status: "pending",
    });
  } catch {
    // Non-fatal if pending status is not allowed by a check constraint; verify/webhook writes success
  }

  const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: ACTIVATION_AMOUNT_KOBO,
      currency: "NGN",
      reference,
      callback_url: callbackUrl,
      metadata: {
        user_id: userId,
        purpose: "channel_activation",
        channel_name: typeof body.channelName === "string" ? body.channelName : "",
        category: typeof body.category === "string" ? body.category : "Entertainment",
        description: typeof body.description === "string" ? body.description : "",
        channel_logo_url: typeof body.channelLogoUrl === "string" ? body.channelLogoUrl : "",
      },
    }),
  });

  const paystackJson = await paystackRes.json().catch(() => ({}));
  if (!paystackRes.ok || !paystackJson?.status || !paystackJson?.data?.authorization_url) {
    return NextResponse.json(
      { error: paystackJson?.message || "Failed to initialize Paystack transaction" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    reference: paystackJson.data.reference || reference,
    authorization_url: paystackJson.data.authorization_url,
    access_code: paystackJson.data.access_code,
  });
}
