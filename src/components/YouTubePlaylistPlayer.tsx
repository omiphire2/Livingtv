"use client";

import React, { useEffect, useRef, useState } from "react";
import { SkipForward, Tv } from "lucide-react";

export interface PlaylistProgramItem {
  id: string;
  youtube_url: string;
  youtube_id: string;
  title?: string | null;
  sort_order: number;
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
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayerInstance {
  loadVideoById?: (videoId: string) => void;
  playVideo?: () => void;
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

export default function YouTubePlaylistPlayer({
  items,
  channelName,
}: {
  items: PlaylistProgramItem[];
  channelName: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const itemsRef = useRef<PlaylistProgramItem[]>(items);
  const indexRef = useRef<number>(0);

  itemsRef.current = items;

  useEffect(() => {
    if (items.length === 0) {
      setActiveIndex(0);
      indexRef.current = 0;
      return;
    }
    if (activeIndex >= items.length) {
      setActiveIndex(0);
      indexRef.current = 0;
    } else {
      indexRef.current = activeIndex;
    }
  }, [items, activeIndex]);

  const advanceToNext = () => {
    const len = itemsRef.current.length;
    if (len === 0) return;
    const nextIdx = (indexRef.current + 1) % len;
    indexRef.current = nextIdx;
    setActiveIndex(nextIdx);
    const nextItem = itemsRef.current[nextIdx];
    if (nextItem && playerRef.current?.loadVideoById) {
      playerRef.current.loadVideoById(nextItem.youtube_id);
      playerRef.current.playVideo?.();
    }
  };

  useEffect(() => {
    if (items.length === 0 || !containerRef.current) return;

    let cancelled = false;
    const firstVideo = items[indexRef.current]?.youtube_id || items[0].youtube_id;

    loadYouTubeIframeApi().then(() => {
      if (cancelled || !containerRef.current || !window.YT?.Player) return;

      playerRef.current?.destroy?.();
      containerRef.current.innerHTML = "";
      const mountNode = document.createElement("div");
      mountNode.className = "w-full h-full";
      containerRef.current.appendChild(mountNode);

      const endedCode = window.YT.PlayerState?.ENDED ?? 0;

      playerRef.current = new window.YT.Player(mountNode, {
        videoId: firstVideo,
        playerVars: {
          autoplay: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: (event) => {
            event.target.playVideo?.();
          },
          onStateChange: (event) => {
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
    // Recreate player only when the playlist switches from empty to non-empty
  }, [items.length > 0]);

  useEffect(() => {
    const current = items[activeIndex];
    if (!current || !playerRef.current?.loadVideoById) return;
    playerRef.current.loadVideoById(current.youtube_id);
    playerRef.current.playVideo?.();
  }, [activeIndex, items]);

  if (items.length === 0) return null;

  const currentItem = items[activeIndex] || items[0];

  return (
    <div className="relative w-full h-full bg-black flex flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-zinc-900/95 border-b border-zinc-800 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px] uppercase shrink-0 inline-flex items-center gap-1">
            <Tv className="w-3 h-3" /> Auto-Playlist
          </span>
          <span className="truncate text-zinc-200 font-medium">
            {currentItem.title || `${channelName} — Program ${activeIndex + 1} of ${items.length}`}
          </span>
        </div>
        {items.length > 1 && (
          <button
            type="button"
            onClick={advanceToNext}
            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] inline-flex items-center gap-1 shrink-0"
          >
            Next <SkipForward className="w-3 h-3" />
          </button>
        )}
      </div>
      <div ref={containerRef} className="w-full flex-1 min-h-0" />
    </div>
  );
}
