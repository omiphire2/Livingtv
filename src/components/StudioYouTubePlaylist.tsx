"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { extractYouTubeId } from "@/lib/youtube";
import { ArrowDown, ArrowUp, Clock, ListVideo, Plus, RotateCcw, Trash2 } from "lucide-react";

interface PlaylistRow {
  id: string;
  channel_id: string;
  youtube_url: string;
  youtube_id: string;
  title: string | null;
  sort_order: number;
  duration_sec?: number | null;
}

function parseDurationInput(raw: string): number | null {
  const clean = raw.trim();
  if (!clean) return null;
  if (/^\d+$/.test(clean)) {
    const val = Number(clean);
    return val > 0 ? val : null;
  }
  const parts = clean.split(":").map((p) => Number(p.trim()));
  if (parts.some((n) => Number.isNaN(n) || n < 0)) return null;
  if (parts.length === 2) {
    const sec = parts[0] * 60 + parts[1];
    return sec > 0 ? sec : null;
  }
  if (parts.length === 3) {
    const sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
    return sec > 0 ? sec : null;
  }
  return null;
}

function formatDuration(sec?: number | null): string {
  if (!sec || sec <= 0) return "auto-end";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function StudioYouTubePlaylist({
  channelId,
  channelName,
}: {
  channelId: string;
  channelName: string;
}) {
  const supabase = createClient();
  const [items, setItems] = useState<PlaylistRow[]>([]);
  const [ytUrl, setYtUrl] = useState("");
  const [ytTitle, setYtTitle] = useState("");
  const [durationInput, setDurationInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const loadQueue = useCallback(async () => {
    if (!channelId) return;
    const { data, error } = await supabase
      .from("channel_playlist_items")
      .select("id, channel_id, youtube_url, youtube_id, title, sort_order, duration_sec")
      .eq("channel_id", channelId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (!error && Array.isArray(data)) {
      setItems(data as PlaylistRow[]);
    }
  }, [channelId, supabase]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleAddVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    const vid = extractYouTubeId(ytUrl);
    if (!vid) {
      setMsg("Enter a valid YouTube link or 11-character video ID.");
      return;
    }

    const parsedDuration = parseDurationInput(durationInput);
    if (durationInput.trim() && !parsedDuration) {
      setMsg("Duration must be seconds (e.g. 600) or mm:ss / hh:mm:ss (e.g. 12:30).");
      return;
    }

    setBusy(true);
    const { data: chRow } = await supabase
      .from("channels")
      .select("playlist_started_at")
      .eq("id", channelId)
      .maybeSingle();

    if (!chRow?.playlist_started_at) {
      await supabase
        .from("channels")
        .update({ playlist_started_at: new Date().toISOString() })
        .eq("id", channelId);
    }

    const nextOrder = items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0;
    const { error } = await supabase.from("channel_playlist_items").insert({
      channel_id: channelId,
      youtube_url: ytUrl.trim(),
      youtube_id: vid,
      title: ytTitle.trim() || null,
      sort_order: nextOrder,
      duration_sec: parsedDuration,
    });

    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }

    setYtUrl("");
    setYtTitle("");
    setDurationInput("");
    setMsg("Added to live lineup. Viewers joining later sync to the channel clock.");
    await loadQueue();
  };

  const handleResetClock = async () => {
    setBusy(true);
    setMsg("");
    const { error } = await supabase
      .from("channels")
      .update({ playlist_started_at: new Date().toISOString() })
      .eq("id", channelId);
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setMsg("Channel schedule clock reset to now.");
  };

  const handleDelete = async (id: string) => {
    setBusy(true);
    setMsg("");
    const { error } = await supabase.from("channel_playlist_items").delete().eq("id", id);
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setMsg("Removed video from lineup.");
    await loadQueue();
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= items.length) return;

    const copy = [...items];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;

    const reindexed = copy.map((row, idx) => ({ ...row, sort_order: idx }));
    setItems(reindexed);
    setBusy(true);
    setMsg("");

    await Promise.all(
      reindexed.map((row) =>
        supabase
          .from("channel_playlist_items")
          .update({ sort_order: row.sort_order })
          .eq("id", row.id)
      )
    );

    setBusy(false);
    setMsg("Updated playback order.");
    await loadQueue();
  };

  const totalSec = items.reduce(
    (sum, item) => sum + (typeof item.duration_sec === "number" && item.duration_sec > 0 ? item.duration_sec : 0),
    0
  );

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListVideo className="w-4 h-4 text-emerald-400" />
          <h3 className="font-semibold text-white">24/7 & 48h YouTube Live Schedule</h3>
        </div>
        <button
          type="button"
          disabled={busy || items.length === 0}
          onClick={handleResetClock}
          className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-[11px] text-zinc-200 inline-flex items-center gap-1"
          title="Anchor schedule clock to right now"
        >
          <RotateCcw className="w-3 h-3" /> Sync Clock Now
        </button>
      </div>

      <p className="text-xs text-zinc-400">
        {channelName} loops your YouTube queue on a continuous channel clock so viewers leaving and coming back find the program already in progress. Add durations (mm:ss) for exact live-offset syncing; edit or swap videos anytime.
      </p>

      <form onSubmit={handleAddVideo} className="space-y-2">
        <input
          type="text"
          value={ytUrl}
          onChange={(e) => setYtUrl(e.target.value)}
          placeholder="YouTube URL (https://youtu.be/... or watch?v=...)"
          className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-white placeholder:text-zinc-500"
        />
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={ytTitle}
            onChange={(e) => setYtTitle(e.target.value)}
            placeholder="Program title (optional)"
            className="flex-1 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-white placeholder:text-zinc-500"
          />
          <input
            type="text"
            value={durationInput}
            onChange={(e) => setDurationInput(e.target.value)}
            placeholder="Length mm:ss (e.g. 25:00)"
            className="sm:w-36 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-white placeholder:text-zinc-500"
          />
          <button
            type="submit"
            disabled={busy}
            className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold text-xs inline-flex items-center justify-center gap-1 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </form>

      {items.length > 0 && (
        <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-0.5">
          <span>{items.length} program(s) in loop</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3 text-emerald-400" /> Cycle length: {totalSec > 0 ? formatDuration(totalSec) : "auto-advance"}
          </span>
        </div>
      )}

      {msg && <p className="text-xs text-emerald-400">{msg}</p>}

      {items.length === 0 ? (
        <p className="text-xs text-zinc-500 py-2">
          No YouTube programs queued yet. Add links above to run a continuous channel feed.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-zinc-100 truncate">
                  {idx + 1}. {item.title || `YouTube (${item.youtube_id})`}
                  <span className="ml-2 text-[11px] text-emerald-400 font-normal">
                    [{formatDuration(item.duration_sec)}]
                  </span>
                </div>
                <div className="text-[11px] text-zinc-500 truncate">{item.youtube_url}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={busy || idx === 0}
                  onClick={() => handleMove(idx, -1)}
                  className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30"
                  title="Move up"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={busy || idx === items.length - 1}
                  onClick={() => handleMove(idx, 1)}
                  className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30"
                  title="Move down"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDelete(item.id)}
                  className="p-1.5 rounded bg-zinc-800 hover:bg-red-900/60 text-zinc-300 hover:text-red-300"
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
