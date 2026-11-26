"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { extractYouTubeId } from "@/lib/youtube";
import { ArrowDown, ArrowUp, ListVideo, Plus, Trash2 } from "lucide-react";

interface PlaylistRow {
  id: string;
  channel_id: string;
  youtube_url: string;
  youtube_id: string;
  title: string | null;
  sort_order: number;
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
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const loadQueue = useCallback(async () => {
    if (!channelId) return;
    const { data, error } = await supabase
      .from("channel_playlist_items")
      .select("id, channel_id, youtube_url, youtube_id, title, sort_order")
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

    setBusy(true);
    const nextOrder = items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0;
    const { error } = await supabase.from("channel_playlist_items").insert({
      channel_id: channelId,
      youtube_url: ytUrl.trim(),
      youtube_id: vid,
      title: ytTitle.trim() || null,
      sort_order: nextOrder,
    });

    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }

    setYtUrl("");
    setYtTitle("");
    setMsg("Added to live YouTube lineup (changes apply anytime).");
    await loadQueue();
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

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListVideo className="w-4 h-4 text-emerald-400" />
          <h3 className="font-semibold text-white">YouTube Auto-Playlist (No vMix/OBS Needed)</h3>
        </div>
        <span className="text-[11px] text-zinc-400">{items.length} queued</span>
      </div>

      <p className="text-xs text-zinc-400">
        Paste YouTube links so {channelName} plays like a continuous channel and auto-advances to the next video when one finishes. Add, remove, or reorder anytime—nothing is permanently locked.
      </p>

      <form onSubmit={handleAddVideo} className="space-y-2">
        <input
          type="text"
          value={ytUrl}
          onChange={(e) => setYtUrl(e.target.value)}
          placeholder="YouTube URL (https://youtu.be/... or watch?v=...)"
          className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-white placeholder:text-zinc-500"
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={ytTitle}
            onChange={(e) => setYtTitle(e.target.value)}
            placeholder="Program label (optional)"
            className="flex-1 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-white placeholder:text-zinc-500"
          />
          <button
            type="submit"
            disabled={busy}
            className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold text-xs inline-flex items-center gap-1 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </form>

      {msg && <p className="text-xs text-emerald-400">{msg}</p>}

      {items.length === 0 ? (
        <p className="text-xs text-zinc-500 py-2">
          No YouTube videos in queue yet. Add links above to run an auto-advancing channel feed.
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
