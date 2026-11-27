"use client";

import React, { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export const SCROLL_MSG_STORAGE_KEY = "livingtv_scroll_message";
export const SCROLL_ACTIVE_STORAGE_KEY = "livingtv_scroll_active";
export const SITE_LOGO_STORAGE_KEY = "livingtv_platform_logo_url";
export const SITE_SETTINGS_EVENT = "livingtv:site-settings-updated";

interface MessageScrollerProps {
  message?: string | null;
  active?: boolean;
  className?: string;
}

export default function MessageScroller({
  message,
  active,
  className = "",
}: MessageScrollerProps) {
  const [resolvedMessage, setResolvedMessage] = useState<string>(message?.trim() || "");
  const [resolvedActive, setResolvedActive] = useState<boolean>(
    typeof active === "boolean" ? active : Boolean(message?.trim())
  );

  useEffect(() => {
    if (typeof message === "string") {
      setResolvedMessage(message.trim());
      setResolvedActive(typeof active === "boolean" ? active : Boolean(message.trim()));
      return;
    }

    const syncFromLocalAndDb = async () => {
      const localMsg = window.localStorage.getItem(SCROLL_MSG_STORAGE_KEY)?.trim() || "";
      const localActiveRaw = window.localStorage.getItem(SCROLL_ACTIVE_STORAGE_KEY);
      const localActive =
        localActiveRaw === null ? Boolean(localMsg) : localActiveRaw === "true";

      setResolvedMessage(localMsg);
      setResolvedActive(localActive && Boolean(localMsg));

      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("site_settings")
          .select("scroll_message, scroll_active")
          .eq("id", 1)
          .maybeSingle();

        if (data && typeof data.scroll_message === "string") {
          const dbMsg = data.scroll_message.trim();
          const dbActive =
            typeof data.scroll_active === "boolean" ? data.scroll_active : Boolean(dbMsg);
          setResolvedMessage(dbMsg);
          setResolvedActive(dbActive && Boolean(dbMsg));
          window.localStorage.setItem(SCROLL_MSG_STORAGE_KEY, dbMsg);
          window.localStorage.setItem(SCROLL_ACTIVE_STORAGE_KEY, String(dbActive));
        }
      } catch {
        // Keep localStorage fallback when site_settings is unreachable
      }
    };

    void syncFromLocalAndDb();
    const pollId = window.setInterval(() => {
      void syncFromLocalAndDb();
    }, 10000);

    const onCustomUpdate = () => {
      void syncFromLocalAndDb();
    };
    window.addEventListener(SITE_SETTINGS_EVENT, onCustomUpdate);
    window.addEventListener("storage", onCustomUpdate);

    return () => {
      window.clearInterval(pollId);
      window.removeEventListener(SITE_SETTINGS_EVENT, onCustomUpdate);
      window.removeEventListener("storage", onCustomUpdate);
    };
  }, [message, active]);

  if (!resolvedActive || !resolvedMessage) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Live broadcast announcement"
      className={`w-full overflow-hidden bg-amber-500/15 border-y border-amber-400/30 text-amber-200 flex items-center ${className}`}
    >
      <div className="px-3 py-1.5 bg-amber-500 text-black font-bold text-[11px] uppercase tracking-wider shrink-0 inline-flex items-center gap-1.5 z-10">
        <Megaphone className="w-3.5 h-3.5" /> Notice
      </div>
      <div className="relative flex-1 overflow-hidden py-1.5">
        <div className="livingtv-marquee-track whitespace-nowrap text-xs font-medium text-amber-100" style={{ animationDuration: `${Math.max(38, Math.round(resolvedMessage.length * 0.35))}s` }}>
          <span className="mx-8">{resolvedMessage}</span>
          <span className="mx-8" aria-hidden="true">{resolvedMessage}</span>
          <span className="mx-8" aria-hidden="true">{resolvedMessage}</span>
        </div>
      </div>
    </div>
  );
}
