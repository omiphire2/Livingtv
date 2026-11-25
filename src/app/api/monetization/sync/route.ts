import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const MIN_WITHDRAWAL_USD = 100;

export async function POST(req: NextRequest) {
  const token = process.env.ADSTERRA_API_TOKEN;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!token) {
    return NextResponse.json(
      { error: "ADSTERRA_API_TOKEN is not configured on the server" },
      { status: 500 }
    );
  }
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const today = new Date().toISOString().slice(0, 10);
  const startDate = String(body.start_date || today);
  const finishDate = String(body.finish_date || today);
  const targetChannelId =
    typeof body.channel_id === "string" && body.channel_id.trim()
      ? body.channel_id.trim()
      : null;

  const statsUrl = new URL("https://api3.adsterratools.com/publisher/stats.json");
  statsUrl.searchParams.set("start_date", startDate);
  statsUrl.searchParams.set("finish_date", finishDate);
  statsUrl.searchParams.set("group_by", "placement");

  const adRes = await fetch(statsUrl.toString(), {
    method: "GET",
    headers: {
      "X-API-Key": token,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!adRes.ok) {
    const errText = await adRes.text();
    return NextResponse.json(
      { error: `Adsterra API error (${adRes.status}): ${errText}` },
      { status: adRes.status }
    );
  }

  const adJson = await adRes.json();
  const rows = Array.isArray(adJson?.items)
    ? adJson.items
    : Array.isArray(adJson?.data)
    ? adJson.data
    : [];

  const totalGrossUsd = rows.reduce((acc: number, row: Record<string, unknown>) => {
    const rawRev = Number(row?.revenue ?? row?.money ?? 0);
    return acc + (Number.isFinite(rawRev) ? rawRev : 0);
  }, 0);

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  let impQuery = supabaseAdmin
    .from("ad_impressions")
    .select("channel_id")
    .gte("created_at", `${startDate}T00:00:00.000Z`)
    .lte("created_at", `${finishDate}T23:59:59.999Z`);

  if (targetChannelId) {
    impQuery = impQuery.eq("channel_id", targetChannelId);
  }

  const { data: impressions } = await impQuery;

  const countsByChannel = new Map<string, number>();
  for (const imp of impressions || []) {
    if (imp.channel_id) {
      countsByChannel.set(imp.channel_id, (countsByChannel.get(imp.channel_id) || 0) + 1);
    }
  }

  const totalImpressions = Array.from(countsByChannel.values()).reduce((a, b) => a + b, 0);

  let channelsQuery = supabaseAdmin.from("channels").select("id, owner_id, channel_name");
  if (targetChannelId) {
    channelsQuery = channelsQuery.eq("id", targetChannelId);
  }
  const { data: channels } = await channelsQuery;

  const platformTotalUsd = Number((totalGrossUsd * 0.6).toFixed(4));
  const streamerTotalUsd = Number((totalGrossUsd * 0.4).toFixed(4));

  const { data: syncRun, error: syncErr } = await supabaseAdmin
    .from("adsterra_sync_runs")
    .insert({
      start_date: startDate,
      finish_date: finishDate,
      total_gross_usd: Number(totalGrossUsd.toFixed(4)),
      platform_share_usd: platformTotalUsd,
      streamer_share_usd: streamerTotalUsd,
      total_impressions: totalImpressions,
    })
    .select()
    .single();

  if (syncErr) {
    return NextResponse.json({ error: syncErr.message }, { status: 500 });
  }

  const channelList = channels || [];
  const allocations = channelList.map((ch) => {
    const chImp = countsByChannel.get(ch.id) || 0;
    let weight = 0;

    if (targetChannelId && ch.id === targetChannelId) {
      // Targeted channel sync assigns 100% of this sync run's revenue to the selected channel
      weight = 1;
    } else if (!targetChannelId && totalImpressions > 0) {
      weight = chImp / totalImpressions;
    }

    const grossUsd = Number((totalGrossUsd * weight).toFixed(4));
    const platformUsd = Number((grossUsd * 0.6).toFixed(4));
    const streamerUsd = Number((grossUsd * 0.4).toFixed(4));

    return {
      sync_run_id: syncRun.id,
      channel_id: ch.id,
      owner_id: ch.owner_id,
      impressions_count: chImp,
      gross_usd: grossUsd,
      platform_usd: platformUsd,
      streamer_usd: streamerUsd,
    };
  });

  if (allocations.length > 0) {
    const { error: allocErr } = await supabaseAdmin
      .from("channel_ad_earnings")
      .insert(allocations);
    if (allocErr) {
      return NextResponse.json({ error: allocErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    minWithdrawalUsd: MIN_WITHDRAWAL_USD,
    targetChannelId,
    syncRun,
    allocationsCount: allocations.length,
  });
}
