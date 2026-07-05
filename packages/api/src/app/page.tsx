"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

import { InputBar } from "@/components/InputBar";
import { Timeline } from "@/components/Timeline";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, useChat } from "@/hooks/useChat";
import { getAccessToken } from "@/lib/client-auth";

export default function ChatPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const {
    entries,
    isStreaming,
    streamingText,
    error,
    clearError,
    showFiltered,
    setShowFiltered,
    loadTimeline,
    sendMessage,
    confirmClaim,
    cancelClaim,
    applyClaimUpdate,
  } = useChat();
  const [timelineLoaded, setTimelineLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

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
      .then(() => {
        setTimelineLoaded(true);
        setLoadFailed(false);
      })
      .catch((err: unknown) => {
        // Only an auth failure means the session is gone; a flaky network
        // must not dump a logged-in physician back to the OTP screen.
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
        } else {
          setLoadFailed(true);
        }
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
        <button
          onClick={() => {
            void setShowFiltered(!showFiltered);
          }}
          className={`text-sm ${showFiltered ? "text-primary" : "text-text-tertiary"} active:text-text-secondary`}
          title="Show routine system events (batch submissions, confirmations)"
        >
          {showFiltered ? "Hide activity" : "All activity"}
        </button>
        <button onClick={logout} className="text-sm text-text-tertiary active:text-text-secondary">
          Sign out
        </button>
      </header>

      {/* Messages */}
      {loadFailed && (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-error-bg px-4 py-2 text-sm text-error">
          <span>Couldn&apos;t load your conversation.</span>
          <button onClick={() => setLoadFailed(false)} className="shrink-0 font-semibold underline">
            Retry
          </button>
        </div>
      )}
      <Timeline
        entries={entries}
        isStreaming={isStreaming}
        streamingText={streamingText}
        onConfirmClaim={confirmClaim}
        onCancelClaim={cancelClaim}
        onApplyClaimUpdate={applyClaimUpdate}
        onWidgetAction={handleWidgetAction}
      />

      {/* Errors from send/confirm/cancel — the physician must never wonder
          whether a claim went through */}
      {error && (
        <div className="flex items-start justify-between gap-2 border-t border-border bg-error-bg px-4 py-2 text-sm text-error">
          <span>{error}</span>
          <button
            onClick={clearError}
            className="shrink-0 font-semibold"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* Input */}
      <InputBar onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}
