"use client";

import React from "react";
import { AdItem } from "@/lib/types";
import { ExternalLink } from "lucide-react";

interface AdCodeSlotProps {
  ad: AdItem;
  height?: number;
  fullScreen?: boolean;
  onInteract?: () => void;
}

function isVideoUrl(url: string, kind?: string | null): boolean {
  if (kind === "video") return true;
  if (kind === "image") return false;
  return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
}

function buildSrcDoc(ad: AdItem): string {
  const snippet =
    ad.ad_code && ad.ad_code.trim().length > 0
      ? ad.ad_code
      : `<div style="color:#a1a1aa;font-family:sans-serif;font-size:13px;">Empty Ad Slot</div>`;

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        color: #ffffff;
        font-family: system-ui, -apple-system, sans-serif;
      }
      * { box-sizing: border-box; max-width: 100%; }
    </style>
  </head>
  <body>${snippet}</body>
</html>`;
}

export default function AdCodeSlot({
  ad,
  height = 90,
  fullScreen = false,
  onInteract,
}: AdCodeSlotProps) {
  const handleClick = () => {
    onInteract?.();
    if (ad.click_through_url) {
      window.open(ad.click_through_url, "_blank", "noopener,noreferrer");
    }
  };

  // Personal picture or video ad
  if (ad.media_url && ad.media_url.trim().length > 0) {
    const isVid = isVideoUrl(ad.media_url, ad.media_kind);

    if (isVid) {
      return (
        <div
          onClick={handleClick}
          className={`relative w-full overflow-hidden rounded-lg bg-black flex items-center justify-center ${
            fullScreen ? "h-full" : ""
          } ${ad.click_through_url ? "cursor-pointer" : ""}`}
          style={fullScreen ? undefined : { height: `${height}px` }}
        >
          <video
            src={ad.media_url}
            autoPlay
            muted
            loop
            playsInline
            controls={fullScreen}
            className="w-full h-full object-contain"
          />
          {ad.click_through_url && !fullScreen && (
            <span className="absolute bottom-1.5 right-2 text-[10px] bg-black/75 text-emerald-300 px-2 py-0.5 rounded inline-flex items-center gap-1">
              Visit <ExternalLink className="w-2.5 h-2.5" />
            </span>
          )}
        </div>
      );
    }

    return (
      <div
        onClick={handleClick}
        className={`relative w-full overflow-hidden rounded-lg bg-zinc-950 flex items-center justify-center ${
          fullScreen ? "h-full" : ""
        } ${ad.click_through_url ? "cursor-pointer" : ""}`}
        style={fullScreen ? undefined : { height: `${height}px` }}
      >
        <img
          src={ad.media_url}
          alt={ad.title}
          className="w-full h-full object-contain"
        />
        {ad.click_through_url && !fullScreen && (
          <span className="absolute bottom-1.5 right-2 text-[10px] bg-black/75 text-emerald-300 px-2 py-0.5 rounded inline-flex items-center gap-1">
            Visit <ExternalLink className="w-2.5 h-2.5" />
          </span>
        )}
      </div>
    );
  }

  // Raw HTML/script/iframe ad code
  return (
    <div
      onClick={() => onInteract?.()}
      className={fullScreen ? "w-full h-full flex items-center justify-center" : "w-full overflow-hidden"}
    >
      <iframe
        title={ad.title}
        srcDoc={buildSrcDoc(ad)}
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
        style={
          fullScreen
            ? { width: "100%", height: "100%", border: "none" }
            : { width: "100%", height: `${height}px`, border: "none" }
        }
      />
    </div>
  );
}
