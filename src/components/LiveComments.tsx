"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CommentItem } from "@/lib/types";
import { ChevronDown, ChevronUp, Clock, MessageCircle, MessageSquareOff, Send, Trash2 } from "lucide-react";

interface LiveCommentsProps {
channelId: string;
commentsEnabled: boolean;
userId?: string | null;
userEmail?: string | null;
compact?: boolean;
showSidewaysStrip?: boolean;
}

const TWENTY_FOUR_HOURS_MS = 2 * 60 * 60 * 1000;
const INITIAL_VISIBLE_COUNT = 5;

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
compact = false,
showSidewaysStrip = false,
}: LiveCommentsProps) {
const supabase = createClient();
const [comments, setComments] = useState<CommentItem[]>([]);
const [message, setMessage] = useState("");
const [sending, setSending] = useState(false);
const [statusNote, setStatusNote] = useState("");
const [showAll, setShowAll] = useState(false);
const [drawerOpen, setDrawerOpen] = useState(!showSidewaysStrip);
const [currentUserId, setCurrentUserId] = useState<string | null>(userId || null);
const [isChannelOwner, setIsChannelOwner] = useState(false);

useEffect(() => {
if (!channelId) return;

let active = true;
const loadOwnership = async () => {
  const [{ data: authData }, { data: channelRow }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("channels").select("owner_id").eq("id", channelId).maybeSingle(),
  ]);
  if (!active) return;
  const resolvedUserId = authData.user?.id || userId || null;
  setCurrentUserId(resolvedUserId);
  setIsChannelOwner(
    Boolean(resolvedUserId && channelRow?.owner_id && resolvedUserId === channelRow.owner_id)
  );
};
loadOwnership();

const cutoffIso = new Date(Date.now() - TWENTY_FOUR_HOURS_MS).toISOString();

const loadRecentComments = async () => {
  const { data, error } = await supabase
    .from("channel_comments")
    .select("*")
    .eq("channel_id", channelId)
    .gt("created_at", cutoffIso)
    .order("created_at", { ascending: true })
    .limit(150);

  if (error) {
    setStatusNote(`Could not load comments: ${error.message}`);
      return;
    }

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

const pruneInterval = setInterval(() => {
  setComments((prev) => prev.filter((item) => isWithin24Hours(item.created_at)));
}, 60000);

return () => {
  active = false;
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

const trimmed = message.trim();
if (!trimmed) return;

const { data: authData } = await supabase.auth.getUser();
const activeUserId = authData.user?.id || userId || currentUserId || null;
if (activeUserId) setCurrentUserId(activeUserId);
const activeEmail = authData.user?.email || userEmail;

setSending(true);
const displayName = activeEmail ? activeEmail.split("@")[0] : "Viewer";

const { data, error } = await supabase
  .from("channel_comments")
  .insert({
    channel_id: channelId,
    user_id: activeUserId,
    user_name: displayName,
    message: trimmed,
  })
  .select()
  .single();

if (error) {
  setStatusNote(`Send failed: ${error.message}`);
} else if (data) {
  const created = data as CommentItem;
  setComments((prev) => (prev.some((item) => item.id === created.id) ? prev : [...prev, created]));
  setMessage("");
  setDrawerOpen(true);
}

setSending(false);
};

const handleDeleteComment = async (commentId: string) => {
  setStatusNote("");
  const { error } = await supabase
    .from("channel_comments")
    .delete()
    .eq("id", commentId);

  if (error) {
    setStatusNote(`Delete failed: ${error.message}`);
    return;
  }

  setComments((prev) => prev.filter((item) => item.id !== commentId));
};

const visibleComments = showAll
? comments
: comments.slice(Math.max(0, comments.length - INITIAL_VISIBLE_COUNT));
const hasMoreComments = comments.length > INITIAL_VISIBLE_COUNT;

if (showSidewaysStrip) {
return (
  <div className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0 flex-1 overflow-x-auto py-1 no-scrollbar">
        {comments.length === 0 ? (
          <span className="text-[11px] text-zinc-500 whitespace-nowrap">
            No comments yet — tap the message icon to comment.
          </span>
        ) : (
          comments.map((c) => (
            <div
              key={c.id}
              className="shrink-0 bg-zinc-950 border border-zinc-800 rounded-full px-3 py-1 text-[11px] flex items-center gap-1.5 max-w-[240px]"
            >
              <span className="font-semibold text-emerald-400 shrink-0">{c.user_name}:</span>
              <span className="text-zinc-200 truncate">{c.message}</span>
            </div>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={() => setDrawerOpen((prev) => !prev)}
        className="h-8 w-8 shrink-0 rounded-lg bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25 text-emerald-400 flex items-center justify-center transition"
        title="Toggle comments"
        aria-label="Toggle comments"
      >
        <MessageCircle className="w-4 h-4" />
      </button>
    </div>

    {drawerOpen && (
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 space-y-2">
        <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
          {visibleComments.length === 0 ? (
            <p className="text-[11px] text-zinc-500 text-center py-2">
              No active comments yet.
            </p>
          ) : (
            visibleComments.map((c) => (
              <div
                key={c.id}
                className="text-xs bg-zinc-900 border border-zinc-800/80 rounded-lg px-2.5 py-1.5 flex items-baseline justify-between gap-2"
              >
                <p className="text-zinc-200 break-words">
                  <span className="font-semibold text-emerald-400 mr-1.5">{c.user_name}:</span>
                  {c.message}
                </p>
<div className="flex items-center gap-1.5 shrink-0">
  <span className="text-[10px] text-zinc-500 shrink-0">
                  {new Date(c.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
  {isChannelOwner && (
  <button
    type="button"
    onClick={() => handleDeleteComment(c.id)}
    className="text-zinc-500 hover:text-red-400 transition p-0.5"
    title="Delete comment"
    aria-label="Delete comment"
  >
    <Trash2 className="w-3 h-3" />
  </button>
)}
</div>
              </div>
            ))
          )}
        </div>

        {hasMoreComments && (
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium inline-flex items-center gap-1"
          >
            {showAll ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" /> Show less comments
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" /> View more comments ({comments.length - INITIAL_VISIBLE_COUNT} more)
              </>
            )}
          </button>
        )}

        {statusNote && (
          <div className="text-[11px] text-amber-300 bg-zinc-900 border border-zinc-800 rounded px-2 py-1">
            {statusNote}
          </div>
        )}

        <form onSubmit={handleSend} className="flex gap-1.5">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={commentsEnabled ? "Comment on Living TV..." : "Comments are OFF"}
            disabled={!commentsEnabled}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !commentsEnabled}
            className="px-3 py-1.5 rounded-lg bg-emerald-500 text-black font-semibold text-xs hover:bg-emerald-400 disabled:opacity-50 inline-flex items-center gap-1"
            title="Send comment"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    )}
  </div>
);
}

return (
<div
  className={`bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col ${
    compact ? "max-h-[260px]" : "max-h-[340px]"
  }`}
>
  <div className="px-3.5 py-2.5 border-b border-zinc-800 flex items-center justify-between gap-2">
    <div>
      <h3 className="font-semibold text-xs sm:text-sm text-white">Live Comments</h3>
      <span className="text-[10px] text-zinc-400 inline-flex items-center gap-1">
        <Clock className="w-2.5 h-2.5 text-amber-400" /> Auto-disappears after 2h
      </span>
    </div>
    <span
      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
        commentsEnabled
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-red-500/15 text-red-300"
      }`}
    >
      {commentsEnabled ? "ON" : "OFF"}
    </span>
  </div>

  {!commentsEnabled ? (
    <div className="flex flex-col items-center justify-center p-4 text-center text-zinc-400 space-y-1">
      <MessageSquareOff className="w-6 h-6 text-zinc-500" />
      <p className="text-xs font-medium text-zinc-200">Commenting is turned OFF</p>
    </div>
  ) : (
    <>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {visibleComments.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-4">
            No active comments yet. Say something live!
          </p>
        ) : (
          visibleComments.map((c) => (
            <div
              key={c.id}
              className="text-xs bg-zinc-950/80 border border-zinc-800/80 rounded-lg px-2.5 py-1.5"
            >
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="font-semibold text-emerald-400 text-[11px]">
                  {c.user_name}
                </span>
<div className="flex items-center gap-1.5 shrink-0">
  <span className="text-[10px] text-zinc-500">
                  {new Date(c.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
  {isChannelOwner && (
  <button
    type="button"
    onClick={() => handleDeleteComment(c.id)}
    className="text-zinc-500 hover:text-red-400 transition p-0.5"
    title="Delete comment"
    aria-label="Delete comment"
  >
    <Trash2 className="w-3 h-3" />
  </button>
)}
</div>
              </div>
              <p className="text-zinc-200 break-words text-xs">{c.message}</p>
            </div>
          ))
        )}

        {hasMoreComments && (
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium inline-flex items-center gap-1 pt-0.5"
          >
            {showAll ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" /> Show less comments
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" /> View more comments ({comments.length - INITIAL_VISIBLE_COUNT} more)
              </>
            )}
          </button>
        )}
      </div>

      {statusNote && (
        <div className="px-3 py-1 text-[11px] bg-zinc-950 border-t border-zinc-800 text-amber-300">
          {statusNote}
        </div>
      )}

      <form onSubmit={handleSend} className="p-2.5 border-t border-zinc-800 flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Write a comment..."
          className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
        />
        <button
          type="submit"
          disabled={sending}
          className="px-3 py-1.5 rounded-lg bg-emerald-500 text-black font-semibold text-xs hover:bg-emerald-400 disabled:opacity-50 inline-flex items-center gap-1"
          title="Send comment"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </>
  )}
</div>
);
}
