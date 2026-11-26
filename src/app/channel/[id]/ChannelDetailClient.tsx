"use client";

import MessageScroller from "@/components/MessageScroller";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AdItem, Channel } from "@/lib/types";
import HlsPlayer from "@/components/HlsPlayer";
import YouTubePlaylistPlayer, { PlaylistProgramItem } from "@/components/YouTubePlaylistPlayer";
import AdCodeSlot from "@/components/AdCodeSlot";
import LiveComments from "@/components/LiveComments";
import StreamingAuthModal from "@/components/StreamingAuthModal";
import { ArrowLeft, CalendarClock, Tv } from "lucide-react";

interface UpcomingProgram {
id: string;
title: string;
starts_at?: string | null;
time_label?: string | null;
description?: string | null;
}

export default function ChannelDetailClient({ channelId }: { channelId: string }) {
const supabase = createClient();

const [channel, setChannel] = useState<Channel | null>(null);
const [loading, setLoading] = useState(true);
const [ads, setAds] = useState<AdItem[]>([]);
const [baseHlsUrl, setBaseHlsUrl] = useState<string>("");
const [logoUrl, setLogoUrl] = useState<string>("");
const [programs, setPrograms] = useState<UpcomingProgram[]>([]);
  const [playlistItems, setPlaylistItems] = useState<PlaylistProgramItem[]>([]);
const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
const [authModalOpen, setAuthModalOpen] = useState(false);

useEffect(() => {
supabase.auth.getUser().then(({ data }) => {
  if (data.user) {
    setUser({ id: data.user.id, email: data.user.email });
  }
});
}, [supabase]);

useEffect(() => {
if (!channelId) return;

const loadChannel = async () => {
  setLoading(true);
  const [{ data: settings }, { data: ch }, { data: adData }] = await Promise.all([
    supabase.from("system_settings").select("base_hls_url, logo_url").eq("id", 1).single(),
    supabase.from("channels").select("*").eq("id", channelId).single(),
    supabase.from("ads").select("*").eq("is_active", true),
  ]);

  if (settings?.base_hls_url) setBaseHlsUrl(settings.base_hls_url);
  if (settings?.logo_url) setLogoUrl(settings.logo_url);
  if (ch) setChannel(ch as Channel);
  if (adData) setAds(adData as AdItem[]);

  const { data: progData, error: progErr } = await supabase
    .from("channel_programs")
    .select("*")
    .eq("channel_id", channelId)
    .limit(10);

  if (!progErr && Array.isArray(progData)) {
    setPrograms(progData as UpcomingProgram[]);
  } else {
    setPrograms([]);
    }

    const { data: plData, error: plErr } = await supabase
      .from("channel_playlist_items")
      .select("id, youtube_url, youtube_id, title, sort_order, duration_sec")
      .eq("channel_id", channelId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (!plErr && Array.isArray(plData)) {
      setPlaylistItems(plData as PlaylistProgramItem[]);
    } else {
      setPlaylistItems([]);
    }

  setLoading(false);
};

loadChannel();

    const channelSub = supabase
      .channel(`playlist-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "channel_playlist_items",
          filter: `channel_id=eq.${channelId}`,
        },
        async () => {
          const { data: updated } = await supabase
            .from("channel_playlist_items")
            .select("id, youtube_url, youtube_id, title, sort_order, duration_sec")
            .eq("channel_id", channelId)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true });
          if (Array.isArray(updated)) {
            setPlaylistItems(updated as PlaylistProgramItem[]);
          }
        }
      )
      .subscribe();

    


  return () => {
      supabase.removeChannel(channelSub);
    };
  }, [channelId, supabase]);

const handleLogImpression = useCallback(
async (ad: AdItem, targetChannelId: string) => {
  const grossNgn = 0.5;
  const platformShareNgn = Number((grossNgn * 0.6).toFixed(4));
  const streamerShareNgn = Number((grossNgn * 0.4).toFixed(4));

  await supabase.from("ad_impressions").insert({
    ad_id: ad.id,
    channel_id: targetChannelId,
    viewer_id: user?.id ?? null,
    revenue_generated_ngn: grossNgn,
    platform_share_ngn: platformShareNgn,
    streamer_share_ngn: streamerShareNgn,
  });
},
[supabase, user?.id]
);

const allOverAds = ads.filter((a) => a.ad_type === "all_over");
const interstitialAds = [
...ads.filter((a) => a.ad_type === "video_interstitial"),
...allOverAds,
];
const bottomBannerAds = [
...ads.filter((a) => a.ad_type === "banner_bottom"),
...allOverAds,
];
const pauseAds = [
...ads.filter((a) => a.ad_type === "pause_overlay"),
...allOverAds,
];

const streamUrl = channel?.custom_hls_url
? channel.custom_hls_url
: channel?.stream_key
? `${baseHlsUrl.replace(/\/+$/, "")}/${channel.stream_key.trim()}/index.m3u8`
: "";

useEffect(() => {
  if (typeof window === "undefined") return;
  let active = true;

  const syncGlobalLogo = async () => {
    const cached = window.localStorage.getItem("livingtv_platform_logo_url")?.trim();
    if (cached && active) {
      setLogoUrl((prev) => (prev === cached ? prev : cached));
    }
    try {
      const { data } = await supabase
        .from("site_settings")
        .select("logo_url")
        .eq("id", 1)
        .maybeSingle();
      const dbLogo = typeof data?.logo_url === "string" ? data.logo_url.trim() : "";
      if (dbLogo && active) {
        setLogoUrl((prev) => (prev === dbLogo ? prev : dbLogo));
        window.localStorage.setItem("livingtv_platform_logo_url", dbLogo);
      }
    } catch {
      // Keep local/existing logo if offline or policy blocks
    }
  };

  void syncGlobalLogo();
  const pollId = window.setInterval(() => {
    void syncGlobalLogo();
  }, 10000);

  const onUpdate = () => {
    void syncGlobalLogo();
  };
  window.addEventListener("livingtv:site-settings-updated", onUpdate);
  window.addEventListener("storage", onUpdate);

  return () => {
    active = false;
    window.clearInterval(pollId);
    window.removeEventListener("livingtv:site-settings-updated", onUpdate);
    window.removeEventListener("storage", onUpdate);
  };
}, [supabase]);

return (
<div className="livingtv-edge-shell min-h-screen bg-zinc-950 text-zinc-100">
      <MessageScroller />
  <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-30">
    <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium inline-flex items-center gap-1.5 text-zinc-200"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All Channels
        </Link>
        <Link href="/" className="flex items-center gap-2 font-bold text-white">
          {logoUrl ? (
            <img src={logoUrl} alt="LivingTV" className="h-8 w-auto object-contain" />
          ) : (
            <Tv className="w-5 h-5 text-emerald-400" />
          )}
          <span className="text-sm sm:text-base">LivingTV</span>
        </Link>
      </div>

      {!user && (
        <button
          type="button"
          onClick={() => setAuthModalOpen(true)}
          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs"
        >
          Sign In
        </button>
      )}
    </div>
  </header>

  <StreamingAuthModal
    isOpen={authModalOpen}
    onClose={() => setAuthModalOpen(false)}
    redirectTo={`/channel/${channelId}`}
  />

  <main className="max-w-6xl mx-auto px-4 py-5 space-y-5">
    {loading ? (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-sm text-zinc-400">
        Loading channel...
      </div>
    ) : !channel ? (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-3">
        <p className="text-zinc-200 font-semibold">Channel not found.</p>
        <Link
          href="/"
          className="inline-block px-4 py-2 rounded-lg bg-emerald-500 text-black text-xs font-bold"
        >
          Back to Home
        </Link>
      </div>
    ) : (
      <>
        <div className="max-h-[260px] sm:max-h-[340px] overflow-hidden rounded-xl border border-zinc-800 bg-black [&>div]:!aspect-auto [&>div]:!h-[260px] sm:[&>div]:!h-[340px]">
          {!channel.custom_hls_url && playlistItems.length > 0 ? (
              <YouTubePlaylistPlayer items={playlistItems} channelName={channel.channel_name} playlistStartedAt={(channel as Channel & { playlist_started_at?: string | null }).playlist_started_at} />
            ) : (
              <HlsPlayer
            streamUrl={streamUrl}
            channelId={channel.id}
            viewerId={user?.id}
            interstitialAds={interstitialAds}
            bottomBannerAds={bottomBannerAds}
            pauseAds={pauseAds}
            onLogImpression={handleLogImpression}
          />
            )}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[11px] font-bold uppercase rounded bg-red-600 text-white">
                {channel.is_live ? "LIVE" : "CHANNEL"}
              </span>
              <h1 className="text-lg font-bold text-white">{channel.channel_name}</h1>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              {channel.description || "Live stream broadcast via vMix / OBS"}
            </p>
          </div>
          <span className="text-xs px-3 py-1 rounded-full bg-zinc-800 text-zinc-300">
            {channel.category}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">Upcoming Programs</h2>
            </div>
            {programs.length === 0 ? (
              <p className="text-xs text-zinc-400 py-4">
                No upcoming programs scheduled for {channel.channel_name} yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {programs.map((prog) => (
                  <div
                    key={prog.id}
                    className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs"
                  >
                    <div className="font-semibold text-zinc-100">{prog.title}</div>
                    {(prog.time_label || prog.starts_at) && (
                      <div className="text-[11px] text-emerald-400 mt-0.5">
                        {prog.time_label || prog.starts_at}
                      </div>
                    )}
                    {prog.description && (
                      <p className="text-zinc-400 mt-1">{prog.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="[&>div]:!h-[240px]">
            <LiveComments
              channelId={channel.id}
              commentsEnabled={channel.comments_enabled}
              userId={user?.id}
              userEmail={user?.email}
            />
          </section>
        </div>

        {ads
          .filter((a) => a.ad_type === "banner_bottom" || a.ad_type === "all_over")
          .slice(0, 1)
          .map((ad) => (
            <div key={ad.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <div className="text-[10px] uppercase tracking-wider text-amber-400 font-semibold mb-1">
                Sponsored • {ad.title}
              </div>
              <AdCodeSlot
                ad={ad}
                height={90}
                onInteract={() => handleLogImpression(ad, channel.id)}
              />
            </div>
          ))}
      </>
    )}
  </main>
</div>
);
}
