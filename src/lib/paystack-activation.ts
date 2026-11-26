import { createClient } from "@supabase/supabase-js";

export const ACTIVATION_AMOUNT_NGN = 30000;
export const ACTIVATION_AMOUNT_KOBO = 3000000;

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(supabaseUrl, serviceKey);
}

export async function grantChannelActivation(params: {
  userId: string;
  reference: string;
  amountNgn?: number;
  channelName?: string;
  category?: string;
  description?: string;
  channelLogoUrl?: string | null;
}) {
  const supabaseAdmin = getSupabaseAdmin();
  const amountNgn = params.amountNgn ?? ACTIVATION_AMOUNT_NGN;

  const { data: existingTx } = await supabaseAdmin
    .from("transactions")
    .select("id, status")
    .eq("reference", params.reference)
    .maybeSingle();

  if (existingTx) {
    const { error: updErr } = await supabaseAdmin
      .from("transactions")
      .update({
        user_id: params.userId,
        amount_ngn: amountNgn,
        purpose: "channel_activation",
        status: "success",
      })
      .eq("reference", params.reference);
    if (updErr) throw new Error(updErr.message);
  } else {
    const { error: insErr } = await supabaseAdmin.from("transactions").insert({
      user_id: params.userId,
      reference: params.reference,
      amount_ngn: amountNgn,
      purpose: "channel_activation",
      status: "success",
    });
    if (insErr) throw new Error(insErr.message);
  }

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", params.userId)
    .maybeSingle();

  const { error: profErr } = await supabaseAdmin
    .from("profiles")
    .update({
      role: prof?.role === "admin" ? "admin" : "streamer",
      is_verified_streamer: true,
      is_monetized: true,
    })
    .eq("id", params.userId);
  if (profErr) throw new Error(profErr.message);

  const { data: existingChannels } = await supabaseAdmin
    .from("channels")
    .select("id")
    .eq("owner_id", params.userId)
    .limit(1);

  if (!existingChannels || existingChannels.length === 0) {
    await supabaseAdmin.from("channels").insert({
      owner_id: params.userId,
      channel_name: params.channelName?.trim() || "LivingTV Creator Channel",
      category: params.category || "Entertainment",
      logo_url: params.channelLogoUrl?.trim() || null,
      description: params.description?.trim() || null,
      is_live: false,
      comments_enabled: true,
      status: "active",
    });
  }
}
