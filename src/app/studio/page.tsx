"use client";

import StudioYouTubePlaylist from "@/components/StudioYouTubePlaylist";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Channel } from "@/lib/types";
import {
  ArrowLeft,
  BadgeCheck,
  Clock,
  Copy,
  Image as ImageIcon,
  MessageSquare,
  MessageSquareOff,
  Play,
  RotateCcw,
  Trash2,
  Tv,
  Upload,
  Wallet,
} from "lucide-react";

const TRIAL_DURATION_SECONDS = 3600; // 1 hour
const STORAGE_BUCKET = "livingtv-media";

interface ProfileData {
  id: string;
  email: string;
  role: string;
  is_verified_streamer: boolean;
  is_monetized: boolean;
  wallet_balance_ngn: number;
  total_earned_ngn: number;
  trial_used: boolean;
  trial_seconds_used: number;
  trial_started_at?: string | null;
}

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function StreamerStudioPage() {
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [hasVerifiedPayment, setHasVerifiedPayment] = useState<boolean>(false);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [viewerCount, setViewerCount] = useState<number>(0);
  const [adStats, setAdStats] = useState<{
    impressions: number;
    streamerEarnedNgn: number;
    syncedUsdAvailable: number;
    syncedUsdTotal: number;
    hasPendingPayout: boolean;
  }>({
    impressions: 0,
    streamerEarnedNgn: 0,
    syncedUsdAvailable: 0,
    syncedUsdTotal: 0,
    hasPendingPayout: false,
  });
  const [requestingPayout, setRequestingPayout] = useState<boolean>(false);
  const isChannelOwner = Boolean(userId && channel?.owner_id === userId);
  const [allChannels, setAllChannels] = useState<Channel[]>([]);
  const isAdmin = profile?.role === "admin";
  const [baseRtmpUrl, setBaseRtmpUrl] = useState("rtmp://13.60.58.40/live");

  const [channelName, setChannelName] = useState("");
  const [category, setCategory] = useState("Entertainment");
  const [description, setDescription] = useState("");
  const [channelLogoUrl, setChannelLogoUrl] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [trialRemainingSec, setTrialRemainingSec] = useState<number>(0);
  const [trialActive, setTrialActive] = useState<boolean>(false);

  const [statusMsg, setStatusMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const loadStudioData = useCallback(
    async (uid: string) => {
      const { data: settings } = await supabase
        .from("system_settings")
        .select("base_rtmp_url")
        .eq("id", 1)
        .single();
      if (settings?.base_rtmp_url) setBaseRtmpUrl(settings.base_rtmp_url);

      const { data: paidTx } = await supabase
        .from("transactions")
        .select("id")
        .eq("user_id", uid)
        .eq("purpose", "channel_activation")
        .eq("status", "success")
        .limit(1);

      const actuallyPaid = Boolean(paidTx && paidTx.length > 0);
      setHasVerifiedPayment(actuallyPaid);

      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", uid)
        .single();

      if (prof) {
        const typedProf = prof as ProfileData;

        if (!actuallyPaid && (typedProf.is_verified_streamer || typedProf.is_monetized)) {
          await supabase
            .from("profiles")
            .update({ is_verified_streamer: false, is_monetized: false })
            .eq("id", uid);
          typedProf.is_verified_streamer = false;
          typedProf.is_monetized = false;
        }

        setProfile(typedProf);

        const storageKey = `livingtv_trial_start_${uid}`;
        const localStartIso =
          typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
        const effectiveStartIso = typedProf.trial_started_at || localStartIso;
        const startMs = effectiveStartIso ? Date.parse(effectiveStartIso) : NaN;

        let elapsedSec = Number(typedProf.trial_seconds_used || 0);
        if (!Number.isNaN(startMs) && startMs > 0) {
          elapsedSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
          if (typeof window !== "undefined" && typedProf.trial_started_at) {
            window.localStorage.setItem(storageKey, typedProf.trial_started_at);
          }
        } else if (typedProf.trial_used && elapsedSec > 0) {
          const inferredStartIso = new Date(Date.now() - elapsedSec * 1000).toISOString();
          if (typeof window !== "undefined") {
            window.localStorage.setItem(storageKey, inferredStartIso);
          }
          void supabase
            .from("profiles")
            .update({ trial_started_at: inferredStartIso })
            .eq("id", uid);
        }

        const clampedElapsed = Math.min(TRIAL_DURATION_SECONDS, elapsedSec);
        const leftSec = Math.max(0, TRIAL_DURATION_SECONDS - elapsedSec);
        setTrialRemainingSec(leftSec);

        if (!actuallyPaid && typedProf.trial_used && leftSec > 0) {
          setTrialActive(true);
        } else {
          setTrialActive(false);
          if (!actuallyPaid && typedProf.trial_used && leftSec <= 0) {
            await supabase
              .from("profiles")
              .update({
                trial_used: true,
                trial_seconds_used: TRIAL_DURATION_SECONDS,
              })
              .eq("id", uid);
            await supabase.from("channels").delete().eq("owner_id", uid);
            setChannel(null);
            setStatusMsg(
              "Free trial expired after 1 hour! Your trial channel was deleted. Pay ₦30,000 to continue streaming."
            );
          } else if (clampedElapsed !== Number(typedProf.trial_seconds_used || 0)) {
            void supabase
              .from("profiles")
              .update({ trial_seconds_used: clampedElapsed })
              .eq("id", uid);
          }
        }
      }

      const { data: profRow } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .maybeSingle();

      const isAdminUser = profRow?.role === "admin";
      let ch: Channel | null = null;

      if (isAdminUser) {
        const { data: adminChannels } = await supabase
          .from("channels")
          .select("*")
          .order("created_at", { ascending: false });
        const list = (adminChannels as Channel[]) || [];
        setAllChannels(list);
        ch = channel ? (list.find((c) => c.id === channel.id) ?? list[0] ?? null) : (list[0] ?? null);
      } else {
        setAllChannels([]);
        const { data: ownCh } = await supabase
          .from("channels")
          .select("*")
          .eq("owner_id", uid)
          .limit(1)
          .maybeSingle();
        ch = (ownCh as Channel) || null;
      }

      if (ch) {
        const typedCh = ch as Channel;
        setChannel(typedCh);
        setChannelName(typedCh.channel_name);
        setCategory(typedCh.category);
        setDescription(typedCh.description || "");
        setChannelLogoUrl(typedCh.logo_url || "");
      } else {
        setChannel(null);
      }
    },
    [supabase]
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        loadStudioData(data.user.id);
      }
    });
  }, [supabase, loadStudioData]);

  useEffect(() => {
    if (!userId || !channel?.id || channel.owner_id !== userId) {
      setAdStats({ impressions: 0, streamerEarnedNgn: 0, syncedUsdAvailable: 0, syncedUsdTotal: 0, hasPendingPayout: false });
      return;
    }

    let active = true;

    const loadAdEarnings = async () => {
      const [{ data: impData }, { data: earnData }, { data: payoutData }] = await Promise.all([
        supabase
          .from("ad_impressions")
          .select("streamer_share_ngn")
          .eq("channel_id", channel.id),
        supabase
          .from("channel_ad_earnings")
          .select("streamer_usd")
          .eq("channel_id", channel.id),
        supabase
          .from("payout_requests")
          .select("amount_usd, status")
          .eq("channel_id", channel.id)
          .in("status", ["pending", "approved", "paid"]),
      ]);

      if (!active) return;
      const rows = (impData as { streamer_share_ngn: number | null }[]) || [];
      const totalStreamerNgn = rows.reduce(
        (sum, r) => sum + Number(r.streamer_share_ngn || 0),
        0
      );

      const earnRows = (earnData as { streamer_usd: number | null }[]) || [];
      const syncedTotalUsd = earnRows.reduce(
        (sum, r) => sum + Number(r.streamer_usd || 0),
        0
      );

      const payoutRows = (payoutData as { amount_usd: number | null; status: string }[]) || [];
      const reservedUsd = payoutRows.reduce(
        (sum, r) => sum + Number(r.amount_usd || 0),
        0
      );
      const pending = payoutRows.some((r) => r.status === "pending");

      setAdStats({
        impressions: rows.length,
        streamerEarnedNgn: Number(totalStreamerNgn.toFixed(2)),
        syncedUsdTotal: Number(syncedTotalUsd.toFixed(2)),
        syncedUsdAvailable: Number(Math.max(0, syncedTotalUsd - reservedUsd).toFixed(2)),
        hasPendingPayout: pending,
      });
    };

    loadAdEarnings();
    const timer = setInterval(loadAdEarnings, 15000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [userId, channel?.id, channel?.owner_id, supabase]);

  useEffect(() => {
    if (!userId || !channel?.id || channel.owner_id !== userId) {
      setViewerCount(0);
      return;
    }

    let active = true;

    const refreshViewerCount = async () => {
      const cutoffIso = new Date(Date.now() - 45000).toISOString();
      const { count } = await supabase
        .from("channel_viewers")
        .select("*", { count: "exact", head: true })
        .eq("channel_id", channel.id)
        .gte("last_seen_at", cutoffIso);

      if (active) {
        setViewerCount(count ?? 0);
      }
    };

    refreshViewerCount();
    const pollTimer = setInterval(refreshViewerCount, 10000);

    const sub = supabase
      .channel(`studio-viewers-${channel.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "channel_viewers",
          filter: `channel_id=eq.${channel.id}`,
        },
        () => {
          refreshViewerCount();
        }
      )
      .subscribe();

    return () => {
      active = false;
      clearInterval(pollTimer);
      supabase.removeChannel(sub);
    };
  }, [userId, channel?.id, channel?.owner_id, supabase]);

  useEffect(() => {
    if (!trialActive || !userId || hasVerifiedPayment) return;

    const storageKey = `livingtv_trial_start_${userId}`;
    const localStartIso =
      typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
    const startIso = profile?.trial_started_at || localStartIso;
    const parsedStartMs = startIso ? Date.parse(startIso) : NaN;
    const startMs = !Number.isNaN(parsedStartMs) && parsedStartMs > 0
      ? parsedStartMs
      : Date.now() - Math.max(0, TRIAL_DURATION_SECONDS - trialRemainingSec) * 1000;

    let expiredHandled = false;

    const syncTick = async () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      const remaining = Math.max(0, TRIAL_DURATION_SECONDS - elapsed);
      setTrialRemainingSec(remaining);

      if (remaining <= 0 && !expiredHandled) {
        expiredHandled = true;
        setTrialActive(false);
        setTrialRemainingSec(0);
        setChannel(null);
        setStatusMsg(
          "Free trial expired after 1 hour! Your trial channel has been automatically deleted. Pay ₦30,000 to continue streaming."
        );
        await supabase
          .from("profiles")
          .update({
            trial_used: true,
            trial_seconds_used: TRIAL_DURATION_SECONDS,
          })
          .eq("id", userId);
        await supabase.from("channels").delete().eq("owner_id", userId);
        setProfile((p) =>
          p
            ? {
                ...p,
                trial_used: true,
                trial_seconds_used: TRIAL_DURATION_SECONDS,
              }
            : p
        );
        return;
      }

      if (elapsed > 0 && elapsed % 15 === 0) {
        void supabase
          .from("profiles")
          .update({
            trial_used: true,
            trial_seconds_used: Math.min(TRIAL_DURATION_SECONDS, elapsed),
          })
          .eq("id", userId);
      }
    };

    void syncTick();
    const interval = setInterval(() => {
      void syncTick();
    }, 1000);

    return () => clearInterval(interval);
  }, [trialActive, userId, hasVerifiedPayment, profile?.trial_started_at, supabase]);

  const handleRequestPayout = async () => {
    if (!userId || !channel?.id || adStats.syncedUsdAvailable < 100 || adStats.hasPendingPayout) {
      return;
    }
    setRequestingPayout(true);
    setStatusMsg("");
    const { error } = await supabase.from("payout_requests").insert({
      streamer_id: userId,
      channel_id: channel.id,
      amount_usd: adStats.syncedUsdAvailable,
      status: "pending",
    });
    if (error) {
      setStatusMsg(`Payout request failed: ${error.message}`);
    } else {
      setStatusMsg(
        `Withdrawal request for $${adStats.syncedUsdAvailable.toFixed(2)} USD submitted!`
      );
      setAdStats((prev) => ({ ...prev, syncedUsdAvailable: 0, hasPendingPayout: true }));
    }
    setRequestingPayout(false);
  };

  const handleUploadChannelLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setUploadingLogo(true);
    setStatusMsg("");

    const ext = file.name.split(".").pop() || "png";
    const filePath = `channel-logos/${userId}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      setStatusMsg(`Logo upload failed: ${uploadError.message}`);
      setUploadingLogo(false);
      return;
    }

    const { data: pubData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    const nextUrl = pubData.publicUrl;
    setChannelLogoUrl(nextUrl);

    if (channel) {
      const { error: updateErr } = await supabase
        .from("channels")
        .update({ logo_url: nextUrl })
        .eq("id", channel.id);

      if (updateErr) {
        setStatusMsg(`Logo uploaded, save error: ${updateErr.message}`);
      } else {
        setChannel({ ...channel, logo_url: nextUrl });
        setStatusMsg("Channel logo uploaded and saved!");
      }
    } else {
      setStatusMsg("Channel logo uploaded! Fill your channel details and start or activate.");
    }

    setUploadingLogo(false);
  };

  const handleSaveChannelAndLogo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    const finalName = (channelName.trim() || channel?.channel_name || "My Channel").trim();
    const cleanedLogo = channelLogoUrl.trim() || null;
    const cleanedDesc = description.trim() || null;

    if (channel) {
      const { error } = await supabase
        .from("channels")
        .update({
          channel_name: finalName,
          category,
          description: cleanedDesc,
          logo_url: cleanedLogo,
        })
        .eq("id", channel.id);

      if (error) {
        setStatusMsg(`Error saving channel: ${error.message}`);
      } else {
        setChannel({
          ...channel,
          channel_name: finalName,
          category,
          description: cleanedDesc,
          logo_url: cleanedLogo,
        });
        setStatusMsg("Channel details saved!");
      }
    } else {
      const { data: created, error } = await supabase
        .from("channels")
        .insert({
          owner_id: userId,
          channel_name: finalName,
          category,
          description: cleanedDesc,
          logo_url: cleanedLogo,
          is_live: true,
          comments_enabled: true,
          status: "active",
        })
        .select()
        .single();

      if (error) {
        setStatusMsg(`Error adding channel: ${error.message}`);
      } else if (created) {
        setChannel(created as Channel);
        setStatusMsg("Channel added!");
      }
    }
  };

  // Delete specific channel details (works during free trial and paid mode)
  const handleDeleteChannelDetail = async (
    field: "logo" | "name" | "category" | "description"
  ) => {
    if (!channel) {
      if (field === "logo") setChannelLogoUrl("");
      if (field === "name") setChannelName("");
      if (field === "category") setCategory("Entertainment");
      if (field === "description") setDescription("");
      setStatusMsg(`Cleared ${field} draft.`);
      return;
    }

    let updatePayload: Partial<Channel> = {};
    let label = "";

    if (field === "logo") {
      updatePayload = { logo_url: null };
      label = "Channel logo";
    } else if (field === "name") {
      updatePayload = { channel_name: "Untitled Channel" };
      label = "Channel name (reset to Untitled Channel)";
    } else if (field === "category") {
      updatePayload = { category: "Entertainment" };
      label = "Category (reset to Entertainment)";
    } else if (field === "description") {
      updatePayload = { description: null };
      label = "Description";
    }

    const { error } = await supabase
      .from("channels")
      .update(updatePayload)
      .eq("id", channel.id);

    if (error) {
      setStatusMsg(`Could not delete ${label}: ${error.message}`);
      return;
    }

    if (field === "logo") setChannelLogoUrl("");
    if (field === "name") setChannelName("Untitled Channel");
    if (field === "category") setCategory("Entertainment");
    if (field === "description") setDescription("");

    setChannel({ ...channel, ...updatePayload });
    setStatusMsg(`${label} deleted.`);
  };

  const handleDeleteEntireChannel = async () => {
    if (!channel) return;

    const { error } = await supabase
      .from("channels")
      .delete()
      .eq("id", channel.id);

    if (error) {
      setStatusMsg(`Could not delete channel: ${error.message}`);
      return;
    }

    setChannel(null);
    setChannelName("");
    setCategory("Entertainment");
    setDescription("");
    setChannelLogoUrl("");
    setStatusMsg("Your channel and all its details have been deleted.");
  };

  const handleStartFreeTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      setStatusMsg("Please sign in with Google on the home page first.");
      return;
    }
    if (profile?.trial_used) {
      setStatusMsg(
        "Your one-time 1-hour free trial has already been used. Pay ₦30,000 to activate streaming."
      );
      return;
    }
    if (!channelName.trim()) {
      setStatusMsg("Enter a channel name to start your 1-hour free trial.");
      return;
    }

    setLoading(true);
    setStatusMsg("");

    await supabase
      .from("profiles")
      .update({
        is_verified_streamer: false,
        is_monetized: false,
        trial_used: true,
        trial_seconds_used: 0,
        trial_started_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (!channel) {
      const { data: createdCh, error: chError } = await supabase
        .from("channels")
        .insert({
          owner_id: userId,
          channel_name: channelName.trim(),
          category,
          logo_url: channelLogoUrl.trim() || null,
          description: description.trim() || null,
          is_live: false,
          comments_enabled: true,
          status: "active",
        })
        .select()
        .single();

      if (chError) {
        setStatusMsg(`Could not start trial channel: ${chError.message}`);
        setLoading(false);
        return;
      }
      if (createdCh) setChannel(createdCh as Channel);
    } else {
      await supabase
        .from("channels")
        .update({
          channel_name: channelName.trim(),
          category,
          logo_url: channelLogoUrl.trim() || channel.logo_url,
          description: description.trim() || channel.description,
        })
        .eq("id", channel.id);
    }

    setTrialRemainingSec(TRIAL_DURATION_SECONDS);
    setTrialActive(true);
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            is_verified_streamer: false,
            is_monetized: false,
            trial_used: true,
            trial_seconds_used: 0,
          }
        : prev
    );
    setStatusMsg(
      "One-time 1-hour free trial started! After 1 hour, you must pay ₦30,000."
    );
    setLoading(false);
  };

  const handleResetTrialForTesting = async () => {
    if (!userId) return;
    setLoading(true);
    await supabase
      .from("profiles")
      .update({
        is_verified_streamer: false,
        is_monetized: false,
        trial_used: false,
        trial_seconds_used: 0,
        trial_started_at: null,
      })
      .eq("id", userId);

    setHasVerifiedPayment(false);
    setTrialActive(false);
    setTrialRemainingSec(TRIAL_DURATION_SECONDS);
    setStatusMsg("Free trial reset for testing (10 minutes available once).");
    await loadStudioData(userId);
    setLoading(false);
  };

  const handleActivateStreamer = async () => {
    if (!userId) {
      setStatusMsg("Please sign in first.");
      return;
    }

    setLoading(true);
    setStatusMsg("");

    const { data: authData } = await supabase.auth.getUser();
    const payerEmail = authData.user?.email || profile?.email || "";
    if (!payerEmail) {
      setStatusMsg("Could not find an account email for Paystack checkout.");
      setLoading(false);
      return;
    }

    const callbackUrl = `${window.location.origin}/studio?uid=${encodeURIComponent(userId)}`;
    const res = await fetch("/api/paystack/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        email: payerEmail,
        callbackUrl,
        channelName: channelName.trim() || "LivingTV Creator Channel",
        category,
        description: description.trim() || null,
        channelLogoUrl: channelLogoUrl.trim() || null,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.authorization_url) {
      setStatusMsg(data?.error || "Failed to start Paystack checkout.");
      setLoading(false);
      return;
    }

    window.location.href = data.authorization_url;
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("reference") || params.get("trxref");
    const qUid = params.get("uid") || userId || "";
    if (!ref) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch(
        `/api/paystack/verify?reference=${encodeURIComponent(ref)}&userId=${encodeURIComponent(qUid)}`
      );
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;

      if (res.ok && data?.ok) {
        const targetUid = data.userId || qUid;
        setTrialActive(false);
        setHasVerifiedPayment(true);
        setStatusMsg(
          "Paystack payment verified (₦30,000)! Your channel is now activated and monetized."
        );
        if (targetUid) {
          await loadStudioData(targetUid);
        }
      } else {
        setStatusMsg(data?.error || "Payment verification pending or unsuccessful.");
      }

      window.history.replaceState({}, "", "/studio");
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toggleComments = async () => {
    if (!channel) return;
    if (!hasVerifiedPayment && !trialActive) {
      setStatusMsg("Your 1-hour trial has ended. Pay ₦30,000 to continue streaming.");
      return;
    }

    const nextValue = !channel.comments_enabled;
    const { error } = await supabase
      .from("channels")
      .update({ comments_enabled: nextValue })
      .eq("id", channel.id);

    if (!error) {
      setChannel({ ...channel, comments_enabled: nextValue });
      setStatusMsg(
        nextValue ? "Live comments turned ON for viewers." : "Live comments turned OFF for viewers."
      );
    }
  };

  const copyText = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    setStatusMsg(`${label} copied to clipboard.`);
  };

  const hasFullAccess = hasVerifiedPayment;
  const canUseStudio = hasFullAccess || trialActive;
  const trialExpired = !hasFullAccess && Boolean(profile?.trial_used) && !trialActive;

  return (
    <div className="livingtv-edge-shell min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" /> Back to LivingTV
          </Link>
          <h1 className="text-xl font-bold text-white">Streamer Studio</h1>
        </div>

        {statusMsg && (
          <div className="p-3 rounded-lg bg-emerald-950/80 border border-emerald-700 text-emerald-200 text-sm">
            {statusMsg}
          </div>
        )}

        {!userId ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center space-y-2">
            <p className="font-medium text-white">Sign in with Google first</p>
            <p className="text-xs text-zinc-400">
              Go back to LivingTV and click &ldquo;Start Streaming Today&rdquo; to sign in with your
              Gmail account.
            </p>
          </div>
        ) : !canUseStudio ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
            <div>
              <span className="text-xs uppercase font-bold text-amber-400">
                {trialExpired
                  ? "10-Minute Free Trial Expired — Payment Required"
                  : "10-Minute Free Trial (Once Per Account) or ₦30,000 Activation"}
              </span>
              <h2 className="text-lg font-bold text-white mt-1">
                {trialExpired
                  ? "Your 10-Minute Free Trial Ended — Pay ₦30,000 to Stream"
                  : "Add Your Channel: Start 10-Min Free Trial or Pay ₦30,000"}
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                {trialExpired
                  ? "The one-time 1-hour free trial has expired. Pay ₦30,000 once to unlock unlimited streaming and ad revenue share."
                  : "Get a one-time 1-hour free streaming trial first, or pay ₦30,000 directly for full channel activation and ad revenue share."}
              </p>
            </div>

            {!profile?.trial_used && (
              <form
                onSubmit={handleStartFreeTrial}
                className="space-y-4 border-b border-zinc-800 pb-5"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Channel Name</label>
                    <input
                      type="text"
                      required
                      value={channelName}
                      onChange={(e) => setChannelName(e.target.value)}
                      placeholder="e.g. Naija Pulse TV"
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="Entertainment">Entertainment</option>
                      <option value="News">News</option>
                      <option value="Sports">Sports</option>
                      <option value="Music">Music</option>
                      <option value="Gaming">Gaming</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What will viewers watch on your stream?"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 rounded-lg bg-emerald-500 text-black font-bold text-sm hover:bg-emerald-400 disabled:opacity-50 inline-flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  {loading ? "Starting Trial..." : "Start 10-Min Free Trial (Once)"}
                </button>
              </form>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-white">
                  Full Channel Activation — ₦30,000
                </div>
                <div className="text-xs text-zinc-400">
                  Unlimited streaming + 15-minute video ad & banner revenue sharing.
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                {profile?.trial_used && (
                  <button
                    type="button"
                    onClick={handleResetTrialForTesting}
                    disabled={loading}
                    className="px-3.5 py-2.5 rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-300 hover:bg-zinc-800 text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reset Trial (Test)
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleActivateStreamer}
                  disabled={loading}
                  className="px-5 py-2.5 rounded-lg bg-amber-500 text-black font-bold text-sm hover:bg-amber-400 disabled:opacity-50"
                >
                  {loading ? "Activating..." : "Activate Channel (₦30,000)"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {trialActive && !hasFullAccess && (
              <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <Clock className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <div className="text-sm font-bold text-amber-300">
                      Free Trial Time Left: {formatCountdown(trialRemainingSec)}
                    </div>
                    <div className="text-xs text-zinc-300">
                      One-time 1-hour trial running. When it ends, you must pay ₦30,000.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleActivateStreamer}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-amber-500 text-black font-bold text-xs hover:bg-amber-400"
                >
                  Pay ₦30,000 Now
                </button>
              </div>
            )}

            {/* Earnings & Monetization Status */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="text-xs text-zinc-400 flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-emerald-400" /> Available Balance
                </div>
                <div className="text-2xl font-bold text-white mt-1">
                  ₦{Number(profile?.wallet_balance_ngn || 0).toFixed(2)}
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="text-xs text-zinc-400">Total Earned</div>
                <div className="text-2xl font-bold text-emerald-400 mt-1">
                  ₦{Number(profile?.total_earned_ngn || 0).toFixed(2)}
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="text-xs text-zinc-400 flex items-center gap-1.5">
                  <BadgeCheck className="w-4 h-4 text-emerald-400" /> Plan Status
                </div>
                <div className="text-base font-bold text-white mt-2">
                  {hasFullAccess
                    ? "Monetized (Rev-Share Active)"
                    : `10-Min Free Trial (${formatCountdown(trialRemainingSec)})`}
                </div>
              </div>
            </div>

            {/* Add / Edit / Delete Any Channel Details (Free Trial or Paid) */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-white inline-flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-emerald-400" /> Channel & Channel Details
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Add, update, or delete any detail on your channel while on free trial or paid plan.
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="h-12 px-3 py-1.5 rounded-xl bg-white/95 border border-emerald-400/60 flex items-center gap-2.5 shadow-sm">
                    {channelLogoUrl ? (
                      <img
                        src={channelLogoUrl}
                        alt={channelName || "Channel logo"}
                        className="h-full w-auto max-w-[130px] object-contain"
                      />
                    ) : (
                      <Tv className="w-5 h-5 text-zinc-800" />
                    )}
                    <span className="text-xs font-bold text-zinc-900">
                      {channelName || channel?.channel_name || "Your Channel"}
                    </span>
                  </div>

                  {channel && (
                    <button
                      type="button"
                      onClick={handleDeleteEntireChannel}
                      className="px-3 py-2 rounded-lg bg-red-950/70 border border-red-800 text-red-300 hover:bg-red-900 text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Channel
                    </button>
                  )}
                </div>
              </div>

                        {isAdmin && allChannels.length > 0 && (
            <div className="mb-4 p-3.5 rounded-xl bg-zinc-950 border border-emerald-500/40 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-emerald-300">
                  Admin: Select Any Channel to Edit ({allChannels.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setChannel(null);
                    setChannelName("");
                    setCategory("Entertainment");
                    setDescription("");
                    setChannelLogoUrl("");
                  }}
                  className="text-xs text-emerald-400 hover:underline"
                >
                  + New Channel
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {allChannels.map((c) => {
                  const active = channel?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setChannel(c);
                        setChannelName(c.channel_name);
                        setCategory(c.category);
                        setDescription(c.description || "");
                        setChannelLogoUrl(c.logo_url || "");
                        setStatusMsg("");
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs border transition ${
                        active
                          ? "bg-emerald-500 text-zinc-950 border-emerald-400 font-semibold"
                          : "bg-zinc-900 text-zinc-200 border-zinc-800 hover:border-emerald-500/50"
                      }`}
                    >
                      {c.channel_name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

                    {isChannelOwner && channel && (
            <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-4 py-3">
                <span className="text-xs text-zinc-400 block">Ad Impressions on Your Channel</span>
                <span className="text-lg font-bold text-white tabular-nums">
                  {adStats.impressions}
                </span>
                <span className="text-[11px] text-zinc-500 block mt-0.5">
                  From Adsterra &amp; active channel placements
                </span>
              </div>
              <div className="rounded-xl bg-zinc-950 border border-emerald-500/30 px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs text-zinc-400 block">
                      Synced Adsterra Balance (40% Split)
                    </span>
                    <span className="text-lg font-bold text-emerald-400 tabular-nums">
                      ${adStats.syncedUsdAvailable.toFixed(2)} USD
                    </span>
                    <span className="text-[11px] text-zinc-500 block">
                      Est. live activity: ₦{adStats.streamerEarnedNgn.toFixed(2)} • Split: 60% LivingTV / 40% Streamer
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={
                      requestingPayout ||
                      adStats.syncedUsdAvailable < 100 ||
                      adStats.hasPendingPayout
                    }
                    onClick={handleRequestPayout}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 font-semibold text-xs shrink-0"
                  >
                    {adStats.hasPendingPayout
                      ? "Payout Pending"
                      : adStats.syncedUsdAvailable >= 100
                      ? "Withdraw USD"
                      : "Min $100"}
                  </button>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Minimum withdrawal progress</span>
                    <span>
                      ${Math.min(100, adStats.syncedUsdAvailable).toFixed(2)} / $100.00
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 transition-all"
                      style={{
                        width: `${Math.min(100, (adStats.syncedUsdAvailable / 100) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {isChannelOwner && channel && (
            <div className="mb-4 flex items-center justify-between rounded-xl bg-zinc-950 border border-zinc-800 px-4 py-3">
              <div>
                <span className="text-xs text-zinc-400 block">Your Channel Live Viewers</span>
                <span className="text-xs text-zinc-500">
                  Visible only to you as the streamer for {channel.channel_name}
                </span>
              </div>
              <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm font-bold tabular-nums">
                {viewerCount} {viewerCount === 1 ? "viewer" : "viewers"}
              </span>
            </div>
          )}

          <form onSubmit={handleSaveChannelAndLogo} className="space-y-3">
                {/* Channel Name + Delete */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={channelName}
                    onChange={(e) => setChannelName(e.target.value)}
                    placeholder="Channel Name"
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteChannelDetail("name")}
                    className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 hover:border-red-500/60 text-zinc-300 hover:text-red-300 text-xs inline-flex items-center gap-1"
                    title="Delete/Reset Channel Name"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Name
                  </button>
                </div>

                {/* Channel Logo Upload/URL + Delete Logo */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                  <label className="sm:col-span-3 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 hover:border-emerald-500 text-xs text-zinc-200 cursor-pointer inline-flex items-center justify-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{uploadingLogo ? "Uploading..." : "Upload Logo"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleUploadChannelLogo}
                      className="hidden"
                    />
                  </label>

                  <input
                    type="text"
                    value={channelLogoUrl}
                    onChange={(e) => setChannelLogoUrl(e.target.value)}
                    placeholder="Or logo image URL..."
                    className="sm:col-span-6 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
                  />

                  <button
                    type="button"
                    onClick={() => handleDeleteChannelDetail("logo")}
                    className="sm:col-span-3 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 hover:border-red-500/60 text-zinc-300 hover:text-red-300 text-xs inline-flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Logo
                  </button>
                </div>

                {/* Category + Delete Category */}
                <div className="flex items-center gap-2">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="Entertainment">Entertainment</option>
                    <option value="News">News</option>
                    <option value="Sports">Sports</option>
                    <option value="Music">Music</option>
                    <option value="Gaming">Gaming</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => handleDeleteChannelDetail("category")}
                    className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 hover:border-red-500/60 text-zinc-300 hover:text-red-300 text-xs inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Category
                  </button>
                </div>

                {/* Description + Delete Description */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Channel description (optional)..."
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteChannelDetail("description")}
                    className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 hover:border-red-500/60 text-zinc-300 hover:text-red-300 text-xs inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Description
                  </button>
                </div>

                <div className="pt-1">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-emerald-500 text-black font-semibold text-sm hover:bg-emerald-400"
                  >
                    {channel ? "Save All Changes" : "Add Channel"}
                  </button>
                </div>
              </form>
            </div>

            {/* Comments Kill-Switch */}
            {channel && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-white">Viewer Live Comments</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Turn viewer comments ON or OFF on <strong>{channel.channel_name}</strong> in real time.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleComments}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm inline-flex items-center gap-2 ${
                    channel.comments_enabled
                      ? "bg-emerald-500 text-black hover:bg-emerald-400"
                      : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700"
                  }`}
                >
                  {channel.comments_enabled ? (
                    <>
                      <MessageSquare className="w-4 h-4" /> Comments: ON (Click to Turn Off)
                    </>
                  ) : (
                    <>
                      <MessageSquareOff className="w-4 h-4" /> Comments: OFF (Click to Turn On)
                    </>
                  )}
                </button>
              </div>
            )}

            {/* vMix / OBS Stream Credentials */}
            {channel && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
                <StudioYouTubePlaylist channelId={channel.id} channelName={channel.channel_name} />

            <h3 className="font-semibold text-white">vMix & OBS Broadcast Settings</h3>
                <p className="text-xs text-zinc-400">
                  Use these details in vMix or OBS when your streaming server is linked.
                </p>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                      <div className="truncate pr-2">
                        <span className="text-zinc-500 block">RTMP Server URL</span>
                        <span className="text-zinc-200 font-mono">{baseRtmpUrl}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyText(baseRtmpUrl, "RTMP URL")}
                        className="p-2 rounded bg-zinc-800 hover:bg-zinc-700 shrink-0"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                      <div className="truncate pr-2">
                        <span className="text-zinc-500 block">Stream Key</span>
                        <span className="text-emerald-400 font-mono">{channel.stream_key}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyText(channel.stream_key, "Stream Key")}
                        className="p-2 rounded bg-zinc-800 hover:bg-zinc-700 shrink-0"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
