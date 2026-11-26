"use client";

import MessageScroller from "@/components/MessageScroller";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AdItem, Channel } from "@/lib/types";
import HlsPlayer from "@/components/HlsPlayer";
import AdCodeSlot from "@/components/AdCodeSlot";
import LiveComments from "@/components/LiveComments";
import StreamingAuthModal from "@/components/StreamingAuthModal";
import { Tv, Radio, ShieldCheck, LogOut, Sparkles } from "lucide-react";

export default function LivingTvHome() {
const router = useRouter();
const supabase = createClient();

const [channels, setChannels] = useState<Channel[]>([]);
const [ads, setAds] = useState<AdItem[]>([]);
const [baseHlsUrl, setBaseHlsUrl] = useState<string>("");
const [logoUrl, setLogoUrl] = useState<string>("");

const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
const [isAdmin, setIsAdmin] = useState(false);
const [authModalOpen, setAuthModalOpen] = useState(false);

const primaryChannel = channels.length > 0 ? channels[0] : null;

const loadUserRole = useCallback(
async (uid: string) => {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", uid)
    .single();
  setIsAdmin(data?.role === "admin");
},
[supabase]
);

useEffect(() => {
supabase.auth.getUser().then(({ data }) => {
  if (data.user) {
    setUser({ id: data.user.id, email: data.user.email });
    loadUserRole(data.user.id);
  }
});

const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    setUser({ id: session.user.id, email: session.user.email });
    loadUserRole(session.user.id);
  } else {
    setUser(null);
    setIsAdmin(false);
  }
});


  return () => listener.subscription.unsubscribe();
}, [supabase, loadUserRole]);

useEffect(() => {
  if (typeof window === "undefined") return;
  let active = true;

  const syncGlobalLogo = async () => {
    const localLogo = window.localStorage.getItem("livingtv_platform_logo_url")?.trim();
    if (localLogo && active) {
      setLogoUrl((prev) => (prev === localLogo ? prev : localLogo));
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

useEffect(() => {
const loadInitial = async () => {
  const { data: settings } = await supabase
    .from("system_settings")
    .select("base_hls_url, logo_url")
    .eq("id", 1)
    .single();
  if (settings?.base_hls_url) setBaseHlsUrl(settings.base_hls_url);
  if (settings?.logo_url) setLogoUrl(settings.logo_url);

  const { data: chData } = await supabase
    .from("channels")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (chData && chData.length > 0) {
    setChannels(chData as Channel[]);
  }

  const { data: adData } = await supabase
    .from("ads")
    .select("*")
    .eq("is_active", true);

  if (adData) setAds(adData as AdItem[]);
};

loadInitial();

const chSub = supabase
  .channel("channels-live-updates")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "channels" },
    (payload) => {
      if (payload.eventType === "UPDATE") {
        const updated = payload.new as Channel;
        setChannels((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      } else if (payload.eventType === "INSERT") {
        const inserted = payload.new as Channel;
        if (inserted.status === "active") {
          setChannels((prev) =>
            prev.some((c) => c.id === inserted.id) ? prev : [...prev, inserted]
          );
        }
      } else if (payload.eventType === "DELETE") {
        const deletedId = (payload.old as { id: string }).id;
        setChannels((prev) => prev.filter((c) => c.id !== deletedId));
      }
    }
  )
  .subscribe();

return () => {
  supabase.removeChannel(chSub);
};
}, [supabase]);

const handleLogImpression = useCallback(
async (ad: AdItem, channelId: string) => {
  const grossNgn = 0.5;
  const platformShareNgn = Number((grossNgn * 0.6).toFixed(4));
  const streamerShareNgn = Number((grossNgn * 0.4).toFixed(4));

  await supabase.from("ad_impressions").insert({
    ad_id: ad.id,
    channel_id: channelId,
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
const sidebarAds = [
...ads.filter((a) => a.ad_type === "banner_sidebar"),
...allOverAds,
];
const feedAds = [
...ads.filter((a) => a.ad_type === "channel_feed"),
...allOverAds,
];

useEffect(() => {
if (!primaryChannel?.id) return;

const sessionKey =
  typeof window !== "undefined"
    ? sessionStorage.getItem("livingtv_viewer_sid") ||
      (() => {
        const id = crypto.randomUUID();
        sessionStorage.setItem("livingtv_viewer_sid", id);
        return id;
      })()
    : "anon";

const sendHeartbeat = async () => {
  await supabase.from("channel_viewers").upsert(
    {
      channel_id: primaryChannel.id,
      viewer_session_id: sessionKey,
      user_id: user?.id ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "channel_id,viewer_session_id" }
  );
};

const removeHeartbeat = async () => {
  await supabase
    .from("channel_viewers")
    .delete()
    .eq("channel_id", primaryChannel.id)
    .eq("viewer_session_id", sessionKey);
};

sendHeartbeat();
const timer = setInterval(sendHeartbeat, 15000);

return () => {
  clearInterval(timer);
  removeHeartbeat();
};
}, [primaryChannel?.id, user?.id, supabase]);

const activeStreamUrl = primaryChannel?.custom_hls_url
? primaryChannel.custom_hls_url
: primaryChannel?.stream_key
? `${baseHlsUrl.replace(/\/+$/, "")}/${primaryChannel.stream_key.trim()}/index.m3u8`
: "";

return (
<div className="livingtv-edge-shell min-h-screen bg-zinc-950 text-zinc-100">
  <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-30">
    <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <Link
        href="/"
        className="flex items-center gap-3 font-extrabold text-xl tracking-tight text-white group"
      >
        {logoUrl ? (
          <span className="h-12 sm:h-14 px-3 py-1.5 rounded-xl bg-white/95 border border-emerald-400/60 shadow-md shadow-emerald-500/20 flex items-center justify-center transition group-hover:scale-[1.02]">
            <img
              src={logoUrl}
              alt="LivingTV Logo"
              className="h-full w-auto max-w-[230px] object-contain"
            />
          </span>
        ) : (
          <span className="h-10 w-10 rounded-xl bg-emerald-500/15 border border-emerald-400/40 flex items-center justify-center shadow-sm">
            <Tv className="w-6 h-6 text-emerald-400" />
          </span>
        )}
        <span className="text-white group-hover:text-emerald-300 transition">
          LivingTV
        </span>
      </Link>

      <nav className="flex items-center gap-3 text-sm">
        {user ? (
          <>
            <Link
              href="/studio"
              className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold inline-flex items-center gap-1.5"
            >
              <Radio className="w-4 h-4" />
              Streamer Studio
            </Link>

            {isAdmin && (
              <Link
                href="/admin"
                className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 text-amber-300 font-medium inline-flex items-center gap-1.5"
              >
                <ShieldCheck className="w-4 h-4" />
                Admin Panel
              </Link>
            )}

            <span className="text-xs text-zinc-400 hidden sm:inline">{user.email}</span>
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-xs inline-flex items-center gap-1"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setAuthModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm inline-flex items-center gap-1.5 shadow-sm"
          >
            <Sparkles className="w-4 h-4" />
            Start Streaming Today
          </button>
        )}
      </nav>
    </div>
  </header>

  <StreamingAuthModal
    isOpen={authModalOpen}
    onClose={() => setAuthModalOpen(false)}
    redirectTo="/studio"
  />

  <main className="max-w-7xl mx-auto px-4 py-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
    <div className="lg:col-span-8 space-y-5">
      {primaryChannel ? (
        <>
          <div className="max-h-[260px] sm:max-h-[340px] overflow-hidden rounded-xl border border-zinc-800 bg-black [&>div]:!aspect-auto [&>div]:!h-[260px] sm:[&>div]:!h-[340px]">
            <HlsPlayer
              streamUrl={activeStreamUrl}
              channelId={primaryChannel.id}
              viewerId={user?.id}
              interstitialAds={interstitialAds}
              bottomBannerAds={bottomBannerAds}
              pauseAds={pauseAds}
              onLogImpression={handleLogImpression}
            />
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-[11px] font-bold uppercase rounded bg-red-600 text-white">
                    {primaryChannel.is_live ? "LIVE" : "CHANNEL 1"}
                  </span>
                  <h1 className="text-lg font-bold text-white">{primaryChannel.channel_name}</h1>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  {primaryChannel.description || "Unlimited live broadcast via vMix / OBS"}
                </p>
              </div>
              <span className="text-xs px-3 py-1 rounded-full bg-zinc-800 text-zinc-300">
                {primaryChannel.category}
              </span>
            </div>

            {/* Channel 1 only: sideways-scrolling comments below title + small message icon */}
            <LiveComments
              channelId={primaryChannel.id}
              commentsEnabled={primaryChannel.comments_enabled}
              userId={user?.id}
              userEmail={user?.email}
              showSidewaysStrip
            />
          </div>
        </>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-2">
          <p className="text-zinc-300 font-medium">No channels added yet.</p>
          <p className="text-xs text-zinc-500">
            Click &quot;Start Streaming Today&quot; to sign in with Google and open a channel.
          </p>
        </div>
      )}

      <section className="space-y-3">
        <MessageScroller className="mb-3" />
        <h2 className="text-base font-semibold text-white">All Channels</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {channels.map((ch, idx) => {
            const isPrimary = idx === 0;
            const feedAd = feedAds.length > 0 ? feedAds[idx % feedAds.length] : null;
            return (
              <React.Fragment key={ch.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (isPrimary) {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    } else {
                      router.push(`/channel/${ch.id}`);
                    }
                  }}
                  className={`flex items-center gap-3.5 text-left p-3.5 rounded-xl border transition ${
                    isPrimary
                      ? "bg-zinc-800 border-emerald-500 shadow-md shadow-emerald-500/10"
                      : "bg-zinc-900 border-zinc-800 hover:border-emerald-500/50 hover:bg-zinc-800/70"
                  }`}
                >
                  <span className="h-7 min-w-7 px-1.5 shrink-0 rounded-md bg-zinc-950 border border-zinc-700 text-emerald-400 font-mono text-xs font-bold flex items-center justify-center tabular-nums">
                    {idx + 1}
                  </span>
                  <span className="h-12 w-16 shrink-0 px-2 py-1 rounded-lg bg-white/95 border border-zinc-700 flex items-center justify-center overflow-hidden">
                    {ch.logo_url ? (
                      <img
                        src={ch.logo_url}
                        alt={ch.channel_name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <Tv className="w-6 h-6 text-zinc-800" />
                    )}
                  </span>
                  <span className="font-bold text-white text-sm truncate">
                    {ch.channel_name}
                  </span>
                </button>

                {(idx + 1) % 3 === 0 && feedAd && (
                  <div className="p-3 rounded-xl border border-amber-500/30 bg-zinc-900">
                    <div className="text-[10px] uppercase font-bold text-amber-400 mb-1">
                      Sponsored • {feedAd.title}
                    </div>
                    <AdCodeSlot
                      ad={feedAd}
                      height={110}
                      onInteract={() => {
                        if (primaryChannel) handleLogImpression(feedAd, primaryChannel.id);
                      }}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </section>
    </div>

    <aside className="lg:col-span-4 space-y-5">
      {sidebarAds.map((ad) => (
        <div
          key={ad.id}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-1.5"
        >
          <div className="text-[10px] uppercase tracking-wider text-amber-400 font-semibold px-1">
            Featured Ad • {ad.title}
          </div>
          <AdCodeSlot
            ad={ad}
            height={180}
            onInteract={() => {
              if (primaryChannel) handleLogImpression(ad, primaryChannel.id);
            }}
          />
        </div>
      ))}
    </aside>
  </main>
</div>
);
}
