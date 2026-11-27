"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MessageSquare, Send, ShieldCheck, Tv, Users, X } from "lucide-react";

export interface SupportMessage {
  id: string;
  chat_type: "viewer_group" | "streamer_dm";
  streamer_id: string | null;
  channel_name: string | null;
  sender_role: "viewer" | "streamer" | "admin";
  sender_name: string;
  body: string;
  created_at: string;
}

export interface StreamerThreadOption {
  streamer_id: string;
  channel_name: string;
  email?: string | null;
}

interface SupportChatPanelProps {
  mode: "viewer" | "streamer" | "admin";
  userId?: string | null;
  streamerChannelName?: string | null;
  streamerDisplayName?: string | null;
  streamerOptions?: StreamerThreadOption[];
  buttonLabel?: string;
}

export default function SupportChatPanel({
  mode,
  userId = null,
  streamerChannelName = null,
  streamerDisplayName = null,
  streamerOptions = [],
  buttonLabel = "Contact Us",
}: SupportChatPanelProps) {
  const supabase = useMemo(() => createClient(), []);

  const [open, setOpen] = useState(mode === "streamer" ? false : true);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [viewerName, setViewerName] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [adminTab, setAdminTab] = useState<"viewer_group" | "streamer_dm">("streamer_dm");
  const [selectedStreamerId, setSelectedStreamerId] = useState<string>("");

  // Merge channel-based streamer options with any streamers who sent DMs
  const mergedStreamerOptions = useMemo(() => {
    const map = new Map<string, StreamerThreadOption>();

    for (const opt of streamerOptions) {
      if (!opt.streamer_id) continue;
      map.set(opt.streamer_id, {
        streamer_id: opt.streamer_id,
        channel_name: opt.channel_name || "Streamer Channel",
        email: opt.email || null,
      });
    }

    for (const msg of messages) {
      if (msg.chat_type === "streamer_dm" && msg.streamer_id) {
        const existing = map.get(msg.streamer_id);
        const derivedName =
          msg.channel_name?.trim() ||
          existing?.channel_name ||
          (msg.sender_role === "streamer" ? msg.sender_name : "Streamer Channel");
        map.set(msg.streamer_id, {
          streamer_id: msg.streamer_id,
          channel_name: derivedName,
          email: existing?.email || null,
        });
      }
    }

    return Array.from(map.values());
  }, [streamerOptions, messages]);

  useEffect(() => {
    if (mode === "admin" && mergedStreamerOptions.length > 0) {
      const exists = mergedStreamerOptions.some(
        (s) => s.streamer_id === selectedStreamerId
      );
      if (!exists) {
        setSelectedStreamerId(mergedStreamerOptions[0].streamer_id);
      }
    }
  }, [mode, mergedStreamerOptions, selectedStreamerId]);

  const loadMessages = useCallback(async () => {
    if (mode === "viewer") {
      if (userId) return;
      const { data } = await supabase
        .from("support_messages")
        .select("*")
        .eq("chat_type", "viewer_group")
        .order("created_at", { ascending: true })
        .limit(100);
      if (data) setMessages(data as SupportMessage[]);
      return;
    }

    if (mode === "streamer") {
      if (!userId) return;
      const { data } = await supabase
        .from("support_messages")
        .select("*")
        .eq("chat_type", "streamer_dm")
        .eq("streamer_id", userId)
        .order("created_at", { ascending: true })
        .limit(100);
      if (data) setMessages(data as SupportMessage[]);
      return;
    }

    if (mode === "admin") {
      const { data } = await supabase
        .from("support_messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(300);
      if (data) setMessages(data as SupportMessage[]);
    }
  }, [mode, userId, supabase]);

  useEffect(() => {
    if (mode === "viewer" && userId) return;
    if (mode === "streamer" && !userId) return;

    void loadMessages();

    const channel = supabase
      .channel(`support-chat-${mode}-${userId || "guest"}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages" },
        (payload) => {
          const incoming = payload.new as SupportMessage;
          if (mode === "viewer" && incoming.chat_type === "viewer_group") {
            setMessages((prev) =>
              prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
            );
          } else if (
            mode === "streamer" &&
            incoming.chat_type === "streamer_dm" &&
            incoming.streamer_id === userId
          ) {
            setMessages((prev) =>
              prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
            );
          } else if (mode === "admin") {
            setMessages((prev) =>
              prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
            );
          }
        }
      )
      .subscribe();

    const poll = window.setInterval(() => {
      void loadMessages();
    }, 4000);

    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [mode, userId, loadMessages, supabase]);

  // Only non-signed-in viewers can use the viewer Contact Us chat
  if (mode === "viewer" && userId) return null;
  if (mode === "streamer" && !userId) return null;

  const activeStreamerOption = mergedStreamerOptions.find(
    (s) => s.streamer_id === selectedStreamerId
  );

  const visibleMessages =
    mode === "admin"
      ? adminTab === "viewer_group"
        ? messages.filter((m) => m.chat_type === "viewer_group")
        : messages.filter(
            (m) => m.chat_type === "streamer_dm" && m.streamer_id === selectedStreamerId
          )
      : messages;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setErrorMsg("");
    setSending(true);

    try {
      if (mode === "viewer") {
        if (userId) {
          setErrorMsg("Signed-in streamers cannot post in the viewer Contact Us chat.");
          return;
        }
        const display = viewerName.trim() || "Viewer";
        const { error } = await supabase.from("support_messages").insert({
          chat_type: "viewer_group",
          streamer_id: null,
          channel_name: null,
          sender_role: "viewer",
          sender_name: display,
          body: trimmed,
        });
        if (error) setErrorMsg(error.message);
        else {
          setText("");
          await loadMessages();
        }
      } else if (mode === "streamer") {
        const chTitle = streamerChannelName?.trim() || "Streamer Channel";
        const label = streamerDisplayName?.trim() || chTitle;
        const { error } = await supabase.from("support_messages").insert({
          chat_type: "streamer_dm",
          streamer_id: userId,
          channel_name: chTitle,
          sender_role: "streamer",
          sender_name: label,
          body: trimmed,
        });
        if (error) setErrorMsg(error.message);
        else {
          setText("");
          await loadMessages();
        }
      } else if (mode === "admin") {
        if (adminTab === "viewer_group") {
          const { error } = await supabase.from("support_messages").insert({
            chat_type: "viewer_group",
            streamer_id: null,
            channel_name: null,
            sender_role: "admin",
            sender_name: "Admin",
            body: trimmed,
          });
          if (error) setErrorMsg(error.message);
          else {
            setText("");
            await loadMessages();
          }
        } else {
          if (!selectedStreamerId) {
            setErrorMsg("Select a streamer channel first.");
            return;
          }
          const chName = activeStreamerOption?.channel_name || "Streamer Channel";
          const { error } = await supabase.from("support_messages").insert({
            chat_type: "streamer_dm",
            streamer_id: selectedStreamerId,
            channel_name: chName,
            sender_role: "admin",
            sender_name: "Admin",
            body: trimmed,
          });
          if (error) setErrorMsg(error.message);
          else {
            setText("");
            await loadMessages();
          }
        }
      }
    } finally {
      setSending(false);
    }
  };

  const renderMessageList = () => (
    <div className="h-56 overflow-y-auto rounded-xl bg-zinc-950 border border-zinc-800 p-3 space-y-2">
      {visibleMessages.length === 0 ? (
        <div className="h-full flex items-center justify-center text-xs text-zinc-500 text-center px-2">
          No messages yet. Send a message below to start the conversation.
        </div>
      ) : (
        visibleMessages.map((m) => {
          const isAdminMsg = m.sender_role === "admin";
          return (
            <div
              key={m.id}
              className={`rounded-lg px-3 py-2 text-xs border ${
                isAdminMsg
                  ? "bg-amber-500/15 border-amber-400/40 text-amber-100"
                  : "bg-zinc-900 border-zinc-800 text-zinc-100"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <span className="font-semibold inline-flex items-center gap-1.5">
                  {isAdminMsg ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500 text-black text-[10px] font-bold uppercase">
                      <ShieldCheck className="w-3 h-3" /> Admin
                    </span>
                  ) : (
                    <span>{m.sender_name}</span>
                  )}
                  {m.chat_type === "streamer_dm" && m.channel_name && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                      {m.channel_name}
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {new Date(m.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-zinc-200">{m.body}</p>
            </div>
          );
        })
      )}
    </div>
  );

  const renderComposer = () => (
    <>
      {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}
      <form onSubmit={handleSend} className="flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            mode === "admin" && adminTab === "streamer_dm"
              ? `Reply to ${activeStreamerOption?.channel_name || "streamer"}...`
              : mode === "viewer"
              ? "Write a message to Admin (visible to all viewers)..."
              : "Text the Admin..."
          }
          className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
          {sending ? "Sending..." : "Send"}
        </button>
      </form>
    </>
  );

  // Non-signed-in viewer section styled like a comment/chat section on the page
  if (mode === "viewer") {
    return (
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-white inline-flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              {buttonLabel} — Viewer Chat
            </h2>
            <p className="text-[11px] text-zinc-400">
              Leave a message for Admin. Every viewer sees the chat and Admin replies.
            </p>
          </div>
          <input
            type="text"
            value={viewerName}
            onChange={(e) => setViewerName(e.target.value)}
            placeholder="Your name (optional)"
            maxLength={32}
            className="bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white sm:w-44"
          />
        </div>
        {renderMessageList()}
        {renderComposer()}
      </section>
    );
  }

  // Admin inbox section on /admin
  if (mode === "admin") {
    return (
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 sm:p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-white inline-flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              Contact Us Support Inbox
            </h2>
            <p className="text-xs text-zinc-400">
              Text streamers privately by channel or reply in the public Viewer Group Chat.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAdminTab("streamer_dm")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border ${
                adminTab === "streamer_dm"
                  ? "bg-emerald-500 text-black border-emerald-400"
                  : "bg-zinc-950 text-zinc-300 border-zinc-700 hover:bg-zinc-800"
              }`}
            >
              <Tv className="w-3.5 h-3.5" /> Streamer Chats ({mergedStreamerOptions.length})
            </button>
            <button
              type="button"
              onClick={() => setAdminTab("viewer_group")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border ${
                adminTab === "viewer_group"
                  ? "bg-amber-500 text-black border-amber-400"
                  : "bg-zinc-950 text-zinc-300 border-zinc-700 hover:bg-zinc-800"
              }`}
            >
              <Users className="w-3.5 h-3.5" /> Viewer Group Chat
            </button>
          </div>
        </div>

        {adminTab === "streamer_dm" && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label className="text-xs text-zinc-400 shrink-0">
              Channel / Streamer:
            </label>
            <select
              value={selectedStreamerId}
              onChange={(e) => setSelectedStreamerId(e.target.value)}
              className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
            >
              {mergedStreamerOptions.length === 0 && (
                <option value="">No streamer threads yet</option>
              )}
              {mergedStreamerOptions.map((opt) => (
                <option key={opt.streamer_id} value={opt.streamer_id}>
                  {opt.channel_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {renderMessageList()}
        {renderComposer()}
      </section>
    );
  }

  // Signed-in streamer private 1-on-1 chat with Admin
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-semibold text-white inline-flex items-center gap-1.5"
      >
        <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
        {buttonLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-end sm:items-center justify-center p-2 sm:p-4">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-bold text-white">
                  Contact Us — Admin Direct Chat
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
                aria-label="Close Contact Us chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-800/50 rounded-lg px-3 py-2">
              Private chat between you and Admin for{" "}
              <span className="font-semibold">
                {streamerChannelName || "your channel"}
              </span>
              .
            </div>
            {renderMessageList()}
            {renderComposer()}
          </div>
        </div>
      )}
    </>
  );
}
