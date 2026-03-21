"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

import { InputBar } from "@/components/InputBar";
import { Timeline } from "@/components/Timeline";
import { useAuth } from "@/hooks/useAuth";
import { useChat } from "@/hooks/useChat";
import { getAccessToken } from "@/lib/client-auth";

export default function ChatPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { entries, isStreaming, streamingText, loadTimeline, sendMessage, confirmClaim } =
    useChat();
  const [timelineLoaded, setTimelineLoaded] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (!isAuthenticated || timelineLoaded) return;
    const token = getAccessToken();
    if (!token) return;

    loadTimeline()
      .then(() => setTimelineLoaded(true))
      .catch(() => {
        router.replace("/login");
      });
  }, [isAuthenticated, timelineLoaded, loadTimeline, router]);

  const handleSend = useCallback(
    (message: string) => {
      void sendMessage(message);
    },
    [sendMessage]
  );

  const handleWidgetAction = useCallback(
    (payload: string) => {
      void sendMessage(payload);
    },
    [sendMessage]
  );

  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-dvh max-w-lg flex-col bg-white">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary">
          <span className="h-2 w-2 rounded-full bg-white" />
        </div>
        <h1 className="text-lg font-semibold text-text-primary">Betty</h1>
        <div className="flex-1" />
        <button onClick={logout} className="text-sm text-text-tertiary active:text-text-secondary">
          Sign out
        </button>
      </header>

      {/* Messages */}
      <Timeline
        entries={entries}
        isStreaming={isStreaming}
        streamingText={streamingText}
        onConfirmClaim={confirmClaim}
        onWidgetAction={handleWidgetAction}
      />

      {/* Input */}
      <InputBar onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}
