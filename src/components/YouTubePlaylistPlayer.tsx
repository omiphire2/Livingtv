"use client";

import React, { useEffect, useRef, useState } from "react";
import { Radio, Volume2, VolumeX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export interface PlaylistProgramItem {
  id: string;
  youtube_url: string;
  youtube_id: string;
  title?: string | null;
  sort_order: number;
  duration_sec?: number | null;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (event: { target: YTPlayerInstance }) => void;
            onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
          };
        }
      ) => YTPlayerInstance;
      PlayerState?: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayerInstance {
  loadVideoById?: (
    videoId: string | { videoId: string; startSeconds?: number }
  ) => void;
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  playVideo?: () => void;
  mute?: () => void;
  unMute?: () => void;
  isMuted?: () => boolean;
  destroy?: () => void;
}

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<void>((resolve) => {
    const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    const prevCallback = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      if (prevCallback) prevCallback();
      resolve();
    };

    if (!existingScript) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  });

  return ytApiPromise;
}

function computeLiveSlot(
  items: PlaylistProgramItem[],
  playlistStartedAt?: string | null
): { index: number; startSec: number; isLiveClock: boolean } {
  if (items.length === 0) return { index: 0, startSec: 0, isLiveClock: false };

  const validDurations = items.map((item) =>
    typeof item.duration_sec === "number" && item.duration_sec > 0 ? Math.floor(item.duration_sec) : 0
  );
  const allHaveDuration = validDurations.every((d) => d > 0);
  const totalSec = validDurations.reduce((acc, d) => acc + d, 0);
  const startMs = playlistStartedAt ? Date.parse(playlistStartedAt) : NaN;

  if (!allHaveDuration || totalSec <= 0 || Number.isNaN(startMs)) {
    return { index: 0, startSec: 0, isLiveClock: false };
  }

  const elapsedSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  const loopPos = elapsedSec % totalSec;

  let cursor = 0;
  for (let i = 0; i < items.length; i++) {
    const dur = validDurations[i];
    if (loopPos < cursor + dur) {
      return { index: i, startSec: Math.max(0, loopPos - cursor), isLiveClock: true };
    }
    cursor += dur;
  }

  return { index: 0, startSec: 0, isLiveClock: true };
}

export default function YouTubePlaylistPlayer({
  items,
  channelName,
  playlistStartedAt,
}: {
  items: PlaylistProgramItem[];
  channelName: string;
  playlistStartedAt?: string | null;
}) {
  const supabase = createClient();
  const initialSlot = computeLiveSlot(items, playlistStartedAt);
  const [activeIndex, setActiveIndex] = useState(initialSlot.index);
  const [muted, setMuted] = useState(true);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const itemsRef = useRef<PlaylistProgramItem[]>(items);
  const startedAtRef = useRef<string | null | undefined>(playlistStartedAt);
  const indexRef = useRef<number>(initialSlot.index);
  const initialSeekDoneRef = useRef<boolean>(false);
  const savedDurationIdsRef = useRef<Set<string>>(new Set());

  itemsRef.current = items;
  startedAtRef.current = playlistStartedAt;

  const maybeSaveDuration = async (item: PlaylistProgramItem, target: YTPlayerInstance) => {
    if (!item?.id || item.duration_sec || savedDurationIdsRef.current.has(item.id)) return;
    const dur = Math.floor(target.getDuration?.() || 0);
    if (dur > 0) {
      savedDurationIdsRef.current.add(item.id);
      await supabase
        .from("channel_playlist_items")
        .update({ duration_sec: dur })
        .eq("id", item.id);
    }
  };

  const advanceToNext = () => {
    const len = itemsRef.current.length;
    if (len === 0) return;
    const nextIdx = (indexRef.current + 1) % len;
    indexRef.current = nextIdx;
    setActiveIndex(nextIdx);
    const nextItem = itemsRef.current[nextIdx];
    if (nextItem && playerRef.current?.loadVideoById) {
      playerRef.current.loadVideoById({ videoId: nextItem.youtube_id, startSeconds: 0 });
      playerRef.current.playVideo?.();
    }
  };

  const toggleMute = () => {
    const p = playerRef.current;
    if (!p) return;
    if (muted) {
      p.unMute?.();
      p.playVideo?.();
      setMuted(false);
    } else {
      p.mute?.();
      setMuted(true);
    }
  };

  useEffect(() => {
    if (items.length === 0 || !containerRef.current) return;

    let cancelled = false;
    initialSeekDoneRef.current = false;
    const slot = computeLiveSlot(itemsRef.current, startedAtRef.current);
    const firstItem = itemsRef.current[slot.index] || itemsRef.current[0];
    indexRef.current = slot.index;
    setActiveIndex(slot.index);

    loadYouTubeIframeApi().then(() => {
      if (cancelled || !containerRef.current || !window.YT?.Player) return;

      playerRef.current?.destroy?.();
      containerRef.current.innerHTML = "";
      const mountNode = document.createElement("div");
      mountNode.className = "w-full h-full";
      containerRef.current.appendChild(mountNode);

      const endedCode = window.YT.PlayerState?.ENDED ?? 0;
      const playingCode = window.YT.PlayerState?.PLAYING ?? 1;

      playerRef.current = new window.YT.Player(mountNode, {
        videoId: firstItem.youtube_id,
        playerVars: {
          autoplay: 1,
          mute: 1,
          start: slot.startSec,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: (event) => {
            event.target.mute?.();
            event.target.playVideo?.();
          },
          onStateChange: (event) => {
            const currentSlot = computeLiveSlot(itemsRef.current, startedAtRef.current);
            const activeVideo = itemsRef.current[currentSlot.index] || itemsRef.current[0];

            if (event.data === playingCode) {
              if (activeVideo) {
                void maybeSaveDuration(activeVideo, event.target);
              }
              if (!initialSeekDoneRef.current && currentSlot.isLiveClock && currentSlot.startSec > 0) {
                initialSeekDoneRef.current = true;
                const cur = event.target.getCurrentTime?.() ?? 0;
                if (Math.abs(cur - currentSlot.startSec) > 2) {
                  event.target.seekTo?.(currentSlot.startSec, true);
                }
              }
            }

            if (event.data === endedCode) {
              advanceToNext();
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [items.length > 0, playlistStartedAt]);

  // Keep viewer locked to the live broadcast clock (prevents rewinding)
  useEffect(() => {
    const timer = window.setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime || !p?.seekTo || !p?.loadVideoById) return;
      const slot = computeLiveSlot(itemsRef.current, startedAtRef.current);
      if (!slot.isLiveClock) return;

      if (slot.index !== indexRef.current) {
        indexRef.current = slot.index;
        setActiveIndex(slot.index);
        const targetItem = itemsRef.current[slot.index];
        if (targetItem) {
          p.loadVideoById({ videoId: targetItem.youtube_id, startSeconds: slot.startSec });
          p.playVideo?.();
        }
        return;
      }

      const currentTime = p.getCurrentTime();
      if (Math.abs(currentTime - slot.startSec) > 3) {
        p.seekTo(slot.startSec, true);
        p.playVideo?.();
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, []);

  if (items.length === 0) return null;

  const currentItem = items[activeIndex] || items[0];

  return (
    <div className="relative w-full h-full bg-black flex flex-col select-none">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-zinc-900/95 border-b border-zinc-800 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-1.5 py-0.5 rounded bg-red-600/25 text-red-400 font-bold text-[10px] uppercase shrink-0 inline-flex items-center gap-1">
            <Radio className="w-3 h-3" /> LIVE
          </span>
          <span className="truncate text-zinc-200 font-medium">
            {currentItem.title || channelName}
          </span>
        </div>
        <button
          type="button"
          onClick={toggleMute}
          className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] inline-flex items-center gap-1 shrink-0"
          title={muted ? "Unmute live audio" : "Mute live audio"}
        >
          {muted ? <VolumeX className="w-3 h-3 text-amber-400" /> : <Volume2 className="w-3 h-3 text-emerald-400" />}
          {muted ? "Unmute" : "Muted"}
        </button>
      </div>
      <div ref={containerRef} className="w-full flex-1 min-h-0" />
    </div>
  );
}
