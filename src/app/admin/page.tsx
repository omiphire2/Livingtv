"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { AdItem, AdMediaKind, AdPlacement } from "@/lib/types";

interface PayoutRow {
  id: string;
  streamer_id: string;
  channel_id: string;
  amount_usd: number;
  status: string;
  created_at: string;
}

interface ChannelRow {
  id: string;
  owner_id: string | null;
  channel_name: string;
  station_name?: string | null;
  description: string | null;
  category: string;
  logo_url: string | null;
  stream_key: string;
  custom_hls_url: string | null;
  is_live: boolean;
  comments_enabled: boolean;
  status: string;
  created_at?: string;
}

const CATEGORIES = [
  "Entertainment",
  "News",
  "Sports",
  "Music",
  "Movies",
  "Faith & Gospel",
  "Kids",
  "Education",
  "Lifestyle",
];

const AD_PLACEMENTS: { value: AdPlacement; label: string }[] = [
  { value: "all_over", label: "All Placements (Global)" },
  { value: "video_interstitial", label: "Video Interstitial (Pre/Mid Roll)" },
  { value: "banner_bottom", label: "Player Bottom Banner" },
  { value: "pause_overlay", label: "Pause Overlay Ad" },
  { value: "banner_sidebar", label: "Sidebar Banner" },
  { value: "channel_feed", label: "Channel Feed Ad" },
];

const AD_MEDIA_KINDS: { value: AdMediaKind; label: string }[] = [
  { value: "code", label: "Ad Code (HTML / Script / iFrame)" },
  { value: "image", label: "Custom Image Ad" },
  { value: "video", label: "Custom Video Ad" },
];

function generateStreamKey() {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `tv_${rand}`;
}

export default function AdminChannelsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [uploadingLogo, setUploadingLogo] = useState<boolean>(false);
  const [uploadingAdMedia, setUploadingAdMedia] = useState<boolean>(false);
  const [savingAd, setSavingAd] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Channels state
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [channelName, setChannelName] = useState<string>("");
  const [category, setCategory] = useState<string>("Entertainment");
  const [description, setDescription] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [platformLogoUrl, setPlatformLogoUrl] = useState<string>("");
  const [scrollMessage, setScrollMessage] = useState<string>("");
  const [scrollActive, setScrollActive] = useState<boolean>(false);
  const [brandingMsg, setBrandingMsg] = useState<string>("");
  const [uploadingPlatformLogo, setUploadingPlatformLogo] = useState<boolean>(false);
  const [streamKey, setStreamKey] = useState<string>("tv_pending_key");
  const [customHlsUrl, setCustomHlsUrl] = useState<string>("");
  const [isLive, setIsLive] = useState<boolean>(true);
  const [commentsEnabled, setCommentsEnabled] = useState<boolean>(true);
  const [status, setStatus] = useState<string>("active");
  const [baseRtmpUrl, setBaseRtmpUrl] = useState<string>("rtmp://13.60.58.40:1935");

  // Ads state (Custom Ad + Ad Code)
  const [ads, setAds] = useState<AdItem[]>([]);
  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [adTitle, setAdTitle] = useState<string>("");
  const [advertiserName, setAdvertiserName] = useState<string>("");
  const [adType, setAdType] = useState<AdPlacement>("banner_sidebar");
  const [mediaKind, setMediaKind] = useState<AdMediaKind>("code");
  const [adCode, setAdCode] = useState<string>("");
  const [mediaUrl, setMediaUrl] = useState<string>("");
  const [clickThroughUrl, setClickThroughUrl] = useState<string>("");
  const [durationSeconds, setDurationSeconds] = useState<number>(15);
  const [isActiveAd, setIsActiveAd] = useState<boolean>(true);

  // Adsterra sync & payouts state
  const [syncStartDate, setSyncStartDate] = useState<string>("");
  const [syncFinishDate, setSyncFinishDate] = useState<string>("");
  const [syncChannelId, setSyncChannelId] = useState<string>("");
  const [syncingAdsterra, setSyncingAdsterra] = useState<boolean>(false);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);

  const resetFormForNewChannel = () => {
    setEditingId(null);
    setChannelName("");
    setCategory("Entertainment");
    setDescription("");
    setLogoUrl("");
    setStreamKey(generateStreamKey());
    setCustomHlsUrl("");
    setIsLive(true);
    setCommentsEnabled(true);
    setStatus("active");
  };

  const resetAdForm = () => {
    setEditingAdId(null);
    setAdTitle("");
    setAdvertiserName("");
    setAdType("banner_sidebar");
    setMediaKind("code");
    setAdCode("");
    setMediaUrl("");
    setClickThroughUrl("");
    setDurationSeconds(15);
    setIsActiveAd(true);
  };

  const loadChannels = async () => {
    const { data, error } = await supabase
      .from("channels")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setChannels((data as ChannelRow[]) || []);
  };

  const loadAds = async () => {
    const { data, error } = await supabase
      .from("ads")
      .select("*")
      .order("id", { ascending: false });

    if (!error && data) {
      setAds(data as AdItem[]);
    }
  };

  const loadPayouts = async () => {
    const { data, error } = await supabase
      .from("payout_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setPayouts(data as PayoutRow[]);
    }
  };

  const syncAuthAndRole = async () => {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData?.user?.id ?? null;
    setUserId(uid);

    if (uid) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .maybeSingle();
      setIsAdmin(profile?.role === "admin");
    } else {
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setSyncStartDate((prev) => prev || today);
    setSyncFinishDate((prev) => prev || today);
    setStreamKey((prev) => (prev === "tv_pending_key" ? generateStreamKey() : prev));

    const init = async () => {
      setLoading(true);
      await syncAuthAndRole();

      const { data: settings } = await supabase
        .from("system_settings")
        .select("base_rtmp_url")
        .eq("id", 1)
        .maybeSingle();
      if (settings?.base_rtmp_url) {
        setBaseRtmpUrl(settings.base_rtmp_url);
      }

      await Promise.all([loadChannels(), loadAds(), loadPayouts()]);
      setLoading(false);
    };

    init();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      syncAuthAndRole();
    });

    
    void (async () => {
      try {
        if (typeof window !== "undefined") {
          const savedLogo = window.localStorage.getItem("livingtv_platform_logo_url") || "";
          const savedScroll = window.localStorage.getItem("livingtv_scroll_message") || "";
          const savedActive = window.localStorage.getItem("livingtv_scroll_active") === "true";
          if (savedLogo) setPlatformLogoUrl(savedLogo);
          if (savedScroll) setScrollMessage(savedScroll);
          setScrollActive(savedActive || Boolean(savedScroll.trim()));
        }

        const { data } = await supabase
          .from("site_settings")
          .select("logo_url, scroll_message, scroll_active")
          .eq("id", 1)
          .maybeSingle();
        if (data) {
          if (data.logo_url) setPlatformLogoUrl(data.logo_url);
          if (typeof data.scroll_message === "string") setScrollMessage(data.scroll_message);
          if (typeof data.scroll_active === "boolean") setScrollActive(data.scroll_active);
        }
      } catch {
        // Fallback to localStorage if site_settings table is not yet created
      }
    })();

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  
  const handlePlatformLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPlatformLogo(true);
    setBrandingMsg("");
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const filePath = `logos/platform_${Date.now()}.${ext}`;
      const bucket = process.env.NEXT_PUBLIC_CHANNEL_LOGOS_BUCKET || "channel-logos";
      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, { upsert: true });

      if (upErr) {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            setPlatformLogoUrl(reader.result);
            setBrandingMsg("Logo photo loaded from device. Click Save Logo & Scroll Message to publish.");
          }
          setUploadingPlatformLogo(false);
        };
        reader.readAsDataURL(file);
        return;
      }

      const { data: pubData } = supabase.storage.from(bucket).getPublicUrl(filePath);
      if (pubData?.publicUrl) {
        setPlatformLogoUrl(pubData.publicUrl);
        setBrandingMsg("Logo photo uploaded. Click Save Logo & Scroll Message to publish.");
      }
    } catch {
      setBrandingMsg("Could not upload photo file.");
    } finally {
      setUploadingPlatformLogo(false);
      e.target.value = "";
    }
  };

  const handleSelectChannelToEdit = (ch: ChannelRow) => {
    setMessage(null);
    setErrorMsg(null);
    setEditingId(ch.id);
    setChannelName(ch.channel_name || ch.station_name || "");
    setCategory(ch.category || "Entertainment");
    setDescription(ch.description || "");
    setLogoUrl(ch.logo_url || "");
    setStreamKey(ch.stream_key || generateStreamKey());
    setCustomHlsUrl(ch.custom_hls_url || "");
    setIsLive(Boolean(ch.is_live));
    setCommentsEnabled(ch.comments_enabled !== false);
    setStatus(ch.status || "active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    setErrorMsg(null);
    try {
      const ext = file.name.split(".").pop() || "png";
      const filePath = `logos/admin_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("livingtv")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("livingtv")
        .getPublicUrl(filePath);

      setLogoUrl(publicUrlData.publicUrl);
      setMessage("Logo uploaded.");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to upload logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleAdMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAdMedia(true);
    setErrorMsg(null);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const filePath = `ads/ad_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("livingtv")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("livingtv")
        .getPublicUrl(filePath);

      setMediaUrl(publicUrlData.publicUrl);
      setMessage("Ad media uploaded.");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to upload ad media");
    } finally {
      setUploadingAdMedia(false);
    }
  };

  const handleSaveChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setErrorMsg(null);

    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData?.user?.id ?? userId;

    if (!currentUserId) {
      setErrorMsg("You must be signed in.");
      return;
    }
    if (!isAdmin) {
      setErrorMsg("Admin privileges are required to manage all channels.");
      return;
    }
    if (!channelName.trim()) {
      setErrorMsg("Channel name is required.");
      return;
    }

    setSaving(true);
    try {
      const cleanKey =
        streamKey.trim() && streamKey !== "tv_pending_key"
          ? streamKey.trim()
          : generateStreamKey();

      const payload = {
        channel_name: channelName.trim(),
        station_name: channelName.trim(),
        category: category.trim() || "Entertainment",
        description: description.trim() || null,
        logo_url: logoUrl.trim() || null,
        stream_key: cleanKey,
        custom_hls_url: customHlsUrl.trim() || null,
        is_live: isLive,
        comments_enabled: commentsEnabled,
        status,
      };

      if (editingId) {
        const { error } = await supabase
          .from("channels")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        setMessage(`Updated channel "${payload.channel_name}".`);
      } else {
        const { error } = await supabase
          .from("channels")
          .insert([{ ...payload, owner_id: currentUserId }]);
        if (error) throw error;
        setMessage(`Added new channel "${payload.channel_name}".`);
        resetFormForNewChannel();
      }

      await loadChannels();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save channel");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteChannel = async (ch: ChannelRow) => {
    if (!isAdmin) {
      setErrorMsg("Only admins can delete channels.");
      return;
    }
    const confirmed = window.confirm(
      `Delete channel "${ch.channel_name}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setMessage(null);
    setErrorMsg(null);
    const { error } = await supabase.from("channels").delete().eq("id", ch.id);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    if (editingId === ch.id) {
      resetFormForNewChannel();
    }
    setMessage(`Deleted channel "${ch.channel_name}".`);
    await loadChannels();
  };

  const handleSelectAdToEdit = (ad: AdItem) => {
    setMessage(null);
    setErrorMsg(null);
    setEditingAdId(ad.id);
    setAdTitle(ad.title || "");
    setAdvertiserName(ad.advertiser_name || "");
    setAdType(ad.ad_type || "banner_sidebar");
    setMediaKind((ad.media_kind as AdMediaKind) || (ad.ad_code ? "code" : "image"));
    setAdCode(ad.ad_code || "");
    setMediaUrl(ad.media_url || "");
    setClickThroughUrl(ad.click_through_url || "");
    setDurationSeconds(Number(ad.duration_seconds) || 15);
    setIsActiveAd(Boolean(ad.is_active));
  };

  const handleSaveAd = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setErrorMsg(null);

    if (!userId || !isAdmin) {
      setErrorMsg("Admin privileges are required to save ads.");
      return;
    }
    if (!adTitle.trim()) {
      setErrorMsg("Ad title is required.");
      return;
    }

    setSavingAd(true);
    setErrorMsg(null);
    setMessage(null);
    try {
      const trimmedCode = adCode.trim();
      const trimmedMediaUrl = mediaUrl.trim();
      const trimmedClickUrl = clickThroughUrl.trim();

      if (mediaKind === "code" && !trimmedCode) {
        setErrorMsg("Please paste your ad code snippet before saving.");
        return;
      }

      const payload: Record<string, unknown> = {
        title: adTitle.trim(),
        advertiser_name: advertiserName.trim() || null,
        ad_type: adType,
        media_kind: mediaKind,
        ad_code: mediaKind === "code" ? trimmedCode : trimmedCode || null,
        media_url: mediaKind === "code" ? trimmedMediaUrl || null : trimmedMediaUrl || null,
        click_through_url: trimmedClickUrl || null,
        duration_seconds: Number(durationSeconds) || 15,
        is_active: isActiveAd,
      };

      if (editingAdId) {
        const { error } = await supabase
          .from("ads")
          .update(payload)
          .eq("id", editingAdId);
        if (error) {
          throw new Error(error.message || JSON.stringify(error));
        }
        setMessage(`Updated ad "${String(payload.title)}".`);
      } else {
        const { error } = await supabase.from("ads").insert([payload]);
        if (error) {
          throw new Error(error.message || JSON.stringify(error));
        }
        setMessage(`Added ad "${String(payload.title)}".`);
        resetAdForm();
      }

      await loadAds();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message?: unknown }).message)
          : "Failed to save ad";
      setErrorMsg(msg);
    } finally {
      setSavingAd(false);
    }
  };

  const handleSyncAdsterra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSyncingAdsterra(true);
    setMessage(null);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/monetization/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_date: syncStartDate,
          finish_date: syncFinishDate,
          channel_id: syncChannelId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Sync failed");
      }
      const run = data.syncRun;
      setMessage(
        `Synced Adsterra (${syncStartDate} to ${syncFinishDate}): Gross $${Number(
          run?.total_gross_usd || 0
        ).toFixed(4)} | Platform 60%: $${Number(
          run?.platform_share_usd || 0
        ).toFixed(4)} | Streamers 40%: $${Number(
          run?.streamer_share_usd || 0
        ).toFixed(4)} (${run?.total_impressions || 0} impressions)`
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Adsterra sync failed");
    } finally {
      setSyncingAdsterra(false);
    }
  };

  const handleUpdatePayoutStatus = async (payoutId: string, nextStatus: string) => {
    if (!isAdmin) return;
    const { error } = await supabase
      .from("payout_requests")
      .update({ status: nextStatus })
      .eq("id", payoutId);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setMessage(`Payout marked as ${nextStatus}.`);
    await loadPayouts();
  };

  const handleDeleteAd = async (ad: AdItem) => {
    if (!isAdmin) return;
    const confirmed = window.confirm(`Delete ad "${ad.title}"?`);
    if (!confirmed) return;

    const { error } = await supabase.from("ads").delete().eq("id", ad.id);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    if (editingAdId === ad.id) resetAdForm();
    setMessage(`Deleted ad "${ad.title}".`);
    await loadAds();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
        Loading Admin Channel Manager...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <Link href="/" className="text-sm text-emerald-400 hover:underline">
            ← Back to LivingTV
          </Link>
          <h1 className="text-2xl font-bold mt-1">Admin Channel &amp; Ad Manager</h1>
          <p className="text-sm text-zinc-400">
            Add unlimited channels, edit stream keys/live status, and publish custom ads or ad code.
          </p>
        </div>
        <button
          type="button"
          onClick={resetFormForNewChannel}
          className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm"
        >
          + New Channel Form
        </button>
      </div>

      {!userId && (
        <div className="p-4 rounded-xl bg-amber-950/50 border border-amber-700 text-amber-200 text-sm flex items-center justify-between gap-4">
          <span>Please sign in to your account first.</span>
          <Link
            href="/"
            className="px-3 py-1.5 rounded-lg bg-amber-500 text-zinc-950 font-semibold text-xs shrink-0"
          >
            Go to Sign In
          </Link>
        </div>
      )}

      {userId && !isAdmin && (
        <div className="p-4 rounded-xl bg-red-950/50 border border-red-700 text-red-200 text-sm">
          Your profile does not have <code>role = &apos;admin&apos;</code> yet. Run the SQL snippet to set your profile role to <code>admin</code>.
        </div>
      )}

      {message && (
        <div className="p-3 rounded-lg bg-emerald-950/70 border border-emerald-700 text-emerald-200 text-sm">
          {message}
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-950/70 border border-red-700 text-red-200 text-sm">
          {errorMsg}
        </div>
      )}

      {/* Channel Form */}
      <form
        onSubmit={handleSaveChannel}
        className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {editingId ? "Edit Channel" : "Add New Channel"}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetFormForNewChannel}
              className="text-xs text-zinc-400 hover:text-white underline"
            >
              Cancel editing (switch to Add New)
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Channel Name *</label>
            <input
              type="text"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="e.g. LivingTV News"
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Stream Key</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={streamKey}
                onChange={(e) => setStreamKey(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm font-mono"
              />
              <button
                type="button"
                onClick={() => setStreamKey(generateStreamKey())}
                className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs"
              >
                Regenerate
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              RTMP Server: <code>{baseRtmpUrl}</code>
            </p>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              Custom HLS / Stream URL (Optional)
            </label>
            <input
              type="text"
              value={customHlsUrl}
              onChange={(e) => setCustomHlsUrl(e.target.value)}
              placeholder="Leave empty to use EC2 HLS /<stream_key>/index.m3u8"
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Logo URL</label>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm"
              />
              <label className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs cursor-pointer shrink-0">
                {uploadingLogo ? "Uploading..." : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm"
            >
              <option value="active">active</option>
              <option value="pending">pending</option>
              <option value="suspended">suspended</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short channel description..."
            className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-6 pt-1">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isLive}
              onChange={(e) => setIsLive(e.target.checked)}
              className="rounded"
            />
            Mark channel as LIVE
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={commentsEnabled}
              onChange={(e) => setCommentsEnabled(e.target.checked)}
              className="rounded"
            />
            Enable live comments
          </label>
        </div>

        <div className="pt-2 flex gap-3">
          <button
            type="submit"
            disabled={saving || !isAdmin}
            className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-semibold text-sm"
          >
            {saving
              ? "Saving..."
              : editingId
              ? "Save Channel Changes"
              : "Add Channel"}
          </button>
        </div>
      </form>

      
      {/* Platform Logo & Live Message Scroller Controls */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-white">Platform Logo &amp; Message Scroller</h2>
            <p className="text-xs text-zinc-400">
              Update the main LivingTV header logo (separate from channel logos) and control the scrolling screen message on channel lists and channel pages.
            </p>
          </div>
          {platformLogoUrl && (
            <img
              src={platformLogoUrl}
              alt="Platform Logo Preview"
              className="h-9 w-auto rounded bg-zinc-950 border border-zinc-800 object-contain px-2 py-1"
            />
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-300">
              Platform / Site Logo URL
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={platformLogoUrl}
                onChange={(e) => setPlatformLogoUrl(e.target.value)}
                placeholder="Choose a photo or paste logo URL"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-white"
              />
              <label className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-white font-medium cursor-pointer shrink-0">
                {uploadingPlatformLogo ? "Uploading..." : "Add Photo"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePlatformLogoUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-300">
              Scrolling Message Text (active when entered &amp; enabled)
            </label>
            <input
              type="text"
              value={scrollMessage}
              onChange={(e) => {
                const val = e.target.value;
                setScrollMessage(val);
                if (!val.trim()) setScrollActive(false);
                else setScrollActive(true);
              }}
              placeholder="Type message to scroll across channel list & channel view..."
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-white"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
            <input
              type="checkbox"
              checked={scrollActive && Boolean(scrollMessage.trim())}
              onChange={(e) => setScrollActive(e.target.checked && Boolean(scrollMessage.trim()))}
              className="rounded border-zinc-700 bg-zinc-950"
            />
            Show scrolling message bar when message is set
          </label>

          <button
            type="button"
            onClick={async () => {
              const cleanLogo = platformLogoUrl.trim();
              const cleanMsg = scrollMessage.trim();
              const isActive = Boolean(cleanMsg) && scrollActive;
              window.localStorage.setItem("livingtv_platform_logo_url", cleanLogo);
              window.localStorage.setItem("livingtv_scroll_message", cleanMsg);
              window.localStorage.setItem("livingtv_scroll_active", String(isActive));
              window.dispatchEvent(new Event("livingtv:site-settings-updated"));

              try {
                await supabase.from("site_settings").upsert(
                  {
                    id: 1,
                    logo_url: cleanLogo || null,
                    scroll_message: cleanMsg,
                    scroll_active: isActive,
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: "id" }
                );
              } catch {
                // Local update already applied
              }

              setBrandingMsg(
                isActive
                  ? "Saved platform logo and activated scrolling message."
                  : "Saved platform logo and updated message scroller."
              );
            }}
            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs"
          >
            Save Logo &amp; Scroll Message
          </button>
        </div>

        {brandingMsg && <p className="text-xs text-emerald-400">{brandingMsg}</p>}
      </div>

      {/* All Channels Table */}
      <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">All Channels ({channels.length})</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 text-xs">
                <th className="py-2.5 pr-4">#</th>
                <th className="py-2.5 pr-4">Channel</th>
                <th className="py-2.5 pr-4">Category</th>
                <th className="py-2.5 pr-4">Stream Key</th>
                <th className="py-2.5 pr-4">Live / Status</th>
                <th className="py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {channels.map((ch, idx) => (
                <tr key={ch.id} className="hover:bg-zinc-800/30">
                  <td className="py-3 pr-4 font-mono text-xs text-emerald-400 font-bold">
                    {idx + 1}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      {ch.logo_url ? (
                        <img
                          src={ch.logo_url}
                          alt={ch.channel_name}
                          className="w-9 h-9 rounded-lg object-cover bg-zinc-800 shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-bold shrink-0">
                          TV
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-zinc-100">
                          {ch.channel_name || ch.station_name}
                        </div>
                        {ch.description && (
                          <div className="text-xs text-zinc-400 line-clamp-1">
                            {ch.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-zinc-300">{ch.category}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-zinc-300">
                    {ch.stream_key}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        ch.is_live
                          ? "bg-red-500/20 text-red-300 border border-red-500/40"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {ch.is_live ? "LIVE" : "OFFLINE"}
                    </span>{" "}
                    <span className="text-xs text-zinc-400">({ch.status})</span>
                  </td>
                  <td className="py-3 text-right whitespace-nowrap space-x-2">
                    <button
                      type="button"
                      onClick={() => handleSelectChannelToEdit(ch)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteChannel(ch)}
                      className="px-3 py-1.5 rounded-lg bg-red-950/70 hover:bg-red-900 text-red-200 border border-red-800/60 text-xs font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {channels.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-zinc-500">
                    No channels found yet. Use the form above to add your first channel.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Ad & Ad Code Section */}
      <form
        onSubmit={handleSaveAd}
        className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              {editingAdId ? "Edit Ad" : "Add Ad (Ad Code or Own Custom Ad)"}
            </h2>
            <p className="text-xs text-zinc-400">
              Paste third-party ad code (HTML / script / iframe) or configure your own image/video ad.
            </p>
          </div>
          {editingAdId && (
            <button
              type="button"
              onClick={resetAdForm}
              className="text-xs text-zinc-400 hover:text-white underline"
            >
              Cancel editing ad
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Ad Title *</label>
            <input
              type="text"
              value={adTitle}
              onChange={(e) => setAdTitle(e.target.value)}
              placeholder="e.g. Sidebar Sponsor or Interstitial Spot"
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Advertiser / Sponsor Name</label>
            <input
              type="text"
              value={advertiserName}
              onChange={(e) => setAdvertiserName(e.target.value)}
              placeholder="Optional brand name"
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Ad Placement</label>
            <select
              value={adType}
              onChange={(e) => setAdType(e.target.value as AdPlacement)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm"
            >
              {AD_PLACEMENTS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Ad Format / Source</label>
            <select
              value={mediaKind}
              onChange={(e) => setMediaKind(e.target.value as AdMediaKind)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm"
            >
              {AD_MEDIA_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              Custom Media URL (Image / Video)
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://... (image or mp4)"
                className="flex-1 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm"
              />
              <label className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs cursor-pointer shrink-0">
                {uploadingAdMedia ? "Uploading..." : "Upload"}
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleAdMediaUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Click-Through URL</label>
              <input
                type="text"
                value={clickThroughUrl}
                onChange={(e) => setClickThroughUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Duration (sec)</label>
              <input
                type="number"
                min={1}
                max={300}
                value={durationSeconds}
                onChange={(e) => setDurationSeconds(Number(e.target.value) || 15)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">
            Ad Code (HTML / JS Tag / iFrame)
          </label>
          <textarea
            rows={4}
            value={adCode}
            onChange={(e) => setAdCode(e.target.value)}
            placeholder='<script>...</script> or <div>...</div> or custom ad snippet'
            className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-xs font-mono"
          />
        </div>

        <div className="flex items-center justify-between flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isActiveAd}
              onChange={(e) => setIsActiveAd(e.target.checked)}
              className="rounded"
            />
            Ad active
          </label>

          <button
            type="submit"
            disabled={savingAd || !isAdmin}
            className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold text-sm"
          >
            {savingAd ? "Saving Ad..." : editingAdId ? "Update Ad" : "Save Ad"}
          </button>
        </div>
      </form>

      {/* Adsterra Revenue Sync & Streamer Payouts */}
      <div className="p-5 rounded-2xl bg-zinc-900 border border-emerald-500/30 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-emerald-300">
            Adsterra Revenue Sync (60% Platform / 40% Streamer)
          </h2>
          <p className="text-xs text-zinc-400">
            Pulls real Adsterra USD stats and distributes earnings proportionally by channel impressions. Minimum streamer withdrawal: $100.00 USD.
          </p>
        </div>

        <form onSubmit={handleSyncAdsterra} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Channel Scope</label>
            <select
              value={syncChannelId}
              onChange={(e) => setSyncChannelId(e.target.value)}
              className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm min-w-[210px]"
            >
              <option value="">All Channels (Impression-Weighted)</option>
              {channels.map((ch, idx) => (
                <option key={ch.id} value={ch.id}>
                  #{idx + 1} — {ch.channel_name || ch.station_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Start Date</label>
            <input
              type="date"
              value={syncStartDate}
              onChange={(e) => setSyncStartDate(e.target.value)}
              className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Finish Date</label>
            <input
              type="date"
              value={syncFinishDate}
              onChange={(e) => setSyncFinishDate(e.target.value)}
              className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={syncingAdsterra || !isAdmin}
            className="px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-semibold text-sm"
          >
            {syncingAdsterra ? "Syncing Adsterra..." : "Sync Adsterra Revenue"}
          </button>
        </form>

        <div className="pt-2 border-t border-zinc-800 space-y-2">
          <h3 className="text-sm font-semibold text-zinc-200">
            Streamer Payout Requests ({payouts.length})
          </h3>
          {payouts.length === 0 ? (
            <p className="text-xs text-zinc-500">No withdrawal requests submitted yet.</p>
          ) : (
            <div className="divide-y divide-zinc-800 text-xs">
              {payouts.map((p) => (
                <div key={p.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-white">
                      ${Number(p.amount_usd).toFixed(2)} USD
                    </span>{" "}
                    <span className="text-zinc-400">
                      • Status: <strong className="uppercase text-amber-300">{p.status}</strong> •{" "}
                      {new Date(p.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {p.status === "pending" && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdatePayoutStatus(p.id, "paid")}
                        className="px-2.5 py-1 rounded bg-emerald-500 text-zinc-950 font-semibold"
                      >
                        Mark Paid
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdatePayoutStatus(p.id, "rejected")}
                        className="px-2.5 py-1 rounded bg-red-950 text-red-200 border border-red-800"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Active & Saved Ads List */}
      <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
        <h2 className="text-lg font-semibold">Saved Ads ({ads.length})</h2>
        <div className="divide-y divide-zinc-800/80 text-sm">
          {ads.map((ad) => (
            <div
              key={ad.id}
              className="py-3 flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <div className="font-medium text-zinc-100">
                  {ad.title}{" "}
                  <span className="text-xs font-normal text-amber-400">
                    • {ad.ad_type}
                  </span>
                </div>
                <div className="text-xs text-zinc-400">
                  {ad.is_active ? "Active" : "Inactive"} • {ad.duration_seconds}s
                  {ad.ad_code ? " • Has Ad Code" : ""}
                  {ad.media_url ? " • Has Custom Media" : ""}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectAdToEdit(ad)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteAd(ad)}
                  className="px-3 py-1.5 rounded-lg bg-red-950/70 hover:bg-red-900 text-red-200 border border-red-800/60 text-xs"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {ads.length === 0 && (
            <p className="py-4 text-xs text-zinc-500">No ads created yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
