"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CommentItem } from "@/lib/types";
import { Clock, MessageSquareOff, Send } from "lucide-react";

interface LiveCommentsProps {
  channelId: string;
  commentsEnabled: boolean;
  userId?: string | null;
  userEmail?: string | null;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function isWithin24Hours(createdAt: string): boolean {
  const createdMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdMs)) return true;
  return Date.now() - createdMs < TWENTY_FOUR_HOURS_MS;
}

export default function LiveComments({
  channelId,
  commentsEnabled,
  userId,
  userEmail,
}: LiveCommentsProps) {
  const supabase = createClient();
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [statusNote, setStatusNote] = useState("");

  useEffect(() => {
    if (!channelId) return;

    const cutoffIso = new Date(Date.now() - TWENTY_FOUR_HOURS_MS).toISOString();

    const loadRecentComments = async () => {
      const { data } = await supabase
        .from("channel_comments")
        .select("*")
        .eq("channel_id", channelId)
        .gt("created_at", cutoffIso)
        .order("created_at", { ascending: true })
        .limit(150);

      if (data) {
        setComments((data as CommentItem[]).filter((c) => isWithin24Hours(c.created_at)));
      }
    };

    loadRecentComments();

    const channelSub = supabase
      .channel(`live-comments:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "channel_comments",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const incoming = payload.new as CommentItem;
          if (isWithin24Hours(incoming.created_at)) {
            setComments((prev) => {
              if (prev.some((item) => item.id === incoming.id)) return prev;
              return [...prev, incoming];
            });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "channel_comments",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id?: string })?.id;
          if (deletedId) {
            setComments((prev) => prev.filter((item) => item.id !== deletedId));
          }
        }
      )
      .subscribe();

    // Every minute, prune any comment that has reached 24 hours
    const pruneInterval = setInterval(() => {
      setComments((prev) => prev.filter((item) => isWithin24Hours(item.created_at)));
    }, 60000);

    return () => {
      clearInterval(pruneInterval);
      supabase.removeChannel(channelSub);
    };
  }, [channelId, supabase]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusNote("");

    if (!commentsEnabled) {
      setStatusNote("Commenting is currently turned OFF for this channel.");
      return;
    }

    if (!message.trim()) return;

    if (!userId) {
      setStatusNote("Click 'Start Streaming Today' at the top to sign in with Google and comment.");
      return;
    }

    setSending(true);
    const displayName = userEmail ? userEmail.split("@")[0] : "Viewer";

    const { data, error } = await supabase
      .from("channel_comments")
      .insert({
        channel_id: channelId,
        user_id: userId,
        user_name: displayName,
        message: message.trim(),
      })
      .select()
      .single();

    if (error) {
      setStatusNote(`Could not post comment: ${error.message}`);
    } else if (data) {
      setComments((prev) =>
        prev.some((item) => item.id === (data as CommentItem).id)
          ? prev
          : [...prev, data as CommentItem]
      );
      setMessage("");
    }

    setSending(false);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col h-[470px]">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-sm text-white">Live Comments</h3>
          <span className="text-[11px] text-zinc-400 inline-flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-400" /> Auto-disappears after 24h
          </span>
        </div>
        <span
          className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
            commentsEnabled
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-red-500/15 text-red-300"
          }`}
        >
          {commentsEnabled ? "Comments ON" : "Comments OFF"}
        </span>
      </div>

      {!commentsEnabled ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-400 space-y-2">
          <MessageSquareOff className="w-8 h-8 text-zinc-500" />
          <p className="text-sm font-medium text-zinc-200">
            Commenting is turned OFF
          </p>
          <p className="text-xs text-zinc-500 max-w-xs">
            Live comments are currently disabled for this channel.
          </p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {comments.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center mt-12">
                No active comments in the last 24 hours. Say something live!
              </p>
            ) : (
              comments.map((c) => (
                <div
                  key={c.id}
                  className="text-sm bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-2.5"
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="font-semibold text-emerald-400 text-xs">
                      {c.user_name}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {new Date(c.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-zinc-200 break-words text-xs sm:text-sm">{c.message}</p>
                </div>
              ))
            )}
          </div>

          {statusNote && (
            <div className="px-3 py-1.5 text-xs bg-zinc-950 border-t border-zinc-800 text-amber-300">
              {statusNote}
            </div>
          )}

          <form onSubmit={handleSend} className="p-3 border-t border-zinc-800 flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={userId ? "Write a live comment..." : "Sign in with Google to comment..."}
              className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={sending}
              className="px-3.5 py-2 rounded-lg bg-emerald-500 text-black font-semibold text-sm hover:bg-emerald-400 disabled:opacity-50 inline-flex items-center gap-1"
              title="Send comment"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
