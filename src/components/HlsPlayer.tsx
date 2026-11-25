"use client";
import { AdItem } from "@/lib/types";

import React, { useEffect, useRef } from "react";
import Hls from "hls.js";

interface HlsPlayerProps {
  streamUrl: string;
  posterUrl?: string | null;
  channelId?: string;
  viewerId?: string;
  onLogImpression?: (ad: AdItem, channelId: string) => void | Promise<void>;
  interstitialAds?: AdItem[];
  bottomBannerAds?: AdItem[];
  pauseAds?: AdItem[];
}

export default function HlsPlayer({ streamUrl, posterUrl }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    let cancelled = false;
    let hls: Hls | null = null;

    const handleVideoError = () => {
      if (video.error?.code === MediaError.MEDIA_ERR_ABORTED) {
        return;
      }
    };

    const handleLoadedMetadata = () => {
      if (!cancelled) {
        video.play().catch(() => {
          // Ignore autoplay or abort rejections
        });
      }
    };

    video.addEventListener("error", handleVideoError);

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
      });

      hls.attachMedia(video);

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        if (!cancelled && hls) {
          hls.loadSource(streamUrl);
        }
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!cancelled) {
          video.play().catch(() => {
            // Autoplay with sound may be blocked until user interaction
          });
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (cancelled) return;
        const details = String(data?.details || "");
        if (details.toLowerCase().includes("abort")) {
          return;
        }
        if (data.fatal && hls) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            try {
              hls.startLoad();
            } catch {
              // Ignore abort during restart
            }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try {
              hls.recoverMediaError();
            } catch {
              // Ignore abort during recovery
            }
          } else {
            try {
              hls.destroy();
              hls = null;
            } catch {
              // Ignore cleanup errors
            }
          }
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
      video.addEventListener("loadedmetadata", handleLoadedMetadata);
    }

    return () => {
      cancelled = true;
      video.removeEventListener("error", handleVideoError);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);

      try {
        video.pause();
      } catch {
        // Ignore pause errors during unmount
      }

      if (hls) {
        const instance = hls;
        hls = null;
        try {
          instance.off(Hls.Events.ERROR);
          instance.stopLoad();
          instance.detachMedia();
          instance.destroy();
        } catch {
          // Safe teardown when aborting an in-flight media fetch
        }
      } else if (video.getAttribute("src")) {
        try {
          video.removeAttribute("src");
          video.load();
        } catch {
          // Ignore src reset abort
        }
      }
    };
  }, [streamUrl]);

  return (
    <video
      ref={videoRef}
      poster={posterUrl || undefined}
      controls
      playsInline
      className="w-full h-full object-contain bg-black"
    />
  );
}
