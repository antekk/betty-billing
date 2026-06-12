"use client";

import { useState, useCallback, useRef } from "react";

import { apiFetch, getAccessToken } from "@/lib/client-auth";

export interface TimelineEntry {
  id: string;
  type: "message" | "widget" | "system_event";
  direction: "inbound" | "outbound" | "system";
  content: string | null;
  widgetType: string | null;
  widgetData: Record<string, unknown> | null;
  visibility: string;
  importanceFlag: boolean;
  createdAt: string;
}

interface ChatState {
  entries: TimelineEntry[];
  isStreaming: boolean;
  streamingText: string;
}

interface TimelineResponse {
  entries: TimelineEntry[];
  hasMore: boolean;
}

interface ApiErrorBody {
  error?: string;
}

interface SseDeltaPayload {
  text: string;
}

interface SseWidgetPayload {
  type: string;
  [key: string]: unknown;
}

export function useChat() {
  const [state, setState] = useState<ChatState>({
    entries: [],
    isStreaming: false,
    streamingText: "",
  });
  const [showFiltered, setShowFilteredState] = useState(false);
  // Ref so loadTimeline doesn't change identity when the toggle flips
  const showFilteredRef = useRef(false);

  const loadTimeline = useCallback(async (before?: string) => {
    const params = new URLSearchParams();
    if (before) params.set("before", before);
    params.set("limit", "50");
    if (showFilteredRef.current) params.set("include_filtered", "true");

    const res = await apiFetch(`/api/timeline?${params}`);
    if (!res.ok) throw new Error("Failed to load timeline");

    const data = (await res.json()) as TimelineResponse;

    setState((prev) => ({
      ...prev,
      entries: before ? [...data.entries, ...prev.entries] : data.entries,
    }));

    return data.hasMore;
  }, []);

  const setShowFiltered = useCallback(
    async (value: boolean) => {
      showFilteredRef.current = value;
      setShowFilteredState(value);
      await loadTimeline();
    },
    [loadTimeline]
  );

  const sendMessage = useCallback(async (message: string) => {
    const tempEntry: TimelineEntry = {
      id: `temp-${Date.now()}`,
      type: "message",
      direction: "inbound",
      content: message,
      widgetType: null,
      widgetData: null,
      visibility: "default",
      importanceFlag: false,
      createdAt: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      entries: [...prev.entries, tempEntry],
      isStreaming: true,
      streamingText: "",
    }));

    try {
      const token = getAccessToken();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) throw new Error("Chat request failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const eventStr of events) {
          if (!eventStr.trim()) continue;

          const lines = eventStr.split("\n");
          let eventType = "";
          let eventData = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7);
            } else if (line.startsWith("data: ")) {
              eventData = line.slice(6);
            }
          }

          if (!eventType || !eventData) continue;

          try {
            const parsed: unknown = JSON.parse(eventData);

            switch (eventType) {
              case "delta": {
                const delta = parsed as SseDeltaPayload;
                fullText += delta.text;
                setState((prev) => ({
                  ...prev,
                  streamingText: fullText,
                }));
                break;
              }

              case "widget": {
                const widgetPayload = parsed as SseWidgetPayload;
                const widgetEntry: TimelineEntry = {
                  id: `widget-${Date.now()}`,
                  type: "widget",
                  direction: "outbound",
                  content: null,
                  widgetType: widgetPayload.type,
                  widgetData: widgetPayload,
                  visibility: "default",
                  importanceFlag: false,
                  createdAt: new Date().toISOString(),
                };
                setState((prev) => ({
                  ...prev,
                  entries: [...prev.entries, widgetEntry],
                }));
                break;
              }

              case "done":
                if (fullText.trim()) {
                  const messageEntry: TimelineEntry = {
                    id: `msg-${Date.now()}`,
                    type: "message",
                    direction: "outbound",
                    content: fullText,
                    widgetType: null,
                    widgetData: null,
                    visibility: "default",
                    importanceFlag: false,
                    createdAt: new Date().toISOString(),
                  };
                  setState((prev) => ({
                    ...prev,
                    entries: [...prev.entries, messageEntry],
                    isStreaming: false,
                    streamingText: "",
                  }));
                } else {
                  setState((prev) => ({
                    ...prev,
                    isStreaming: false,
                    streamingText: "",
                  }));
                }
                break;

              case "error":
                setState((prev) => ({
                  ...prev,
                  isStreaming: false,
                  streamingText: "",
                }));
                break;
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isStreaming: false,
        streamingText: "",
      }));
      throw error;
    }
  }, []);

  const confirmClaim = useCallback(
    async (claimId: string) => {
      const res = await apiFetch(`/api/claims/${claimId}/confirm`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = (await res.json()) as ApiErrorBody;
        throw new Error(data.error ?? "Failed to confirm claim");
      }

      // Refetch so the widget status and Betty's acknowledgement appear
      await loadTimeline();
    },
    [loadTimeline]
  );

  const cancelClaim = useCallback(
    async (claimId: string) => {
      const res = await apiFetch(`/api/claims/${claimId}/cancel`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = (await res.json()) as ApiErrorBody;
        throw new Error(data.error ?? "Failed to cancel claim");
      }

      // Refetch so the widget and system event reflect server state
      await loadTimeline();
    },
    [loadTimeline]
  );

  const applyClaimUpdate = useCallback(
    async (claimId: string, timelineEntryId: string) => {
      const res = await apiFetch(`/api/claims/${claimId}/apply-update`, {
        method: "POST",
        body: JSON.stringify({ timelineEntryId }),
      });

      if (!res.ok) {
        const data = (await res.json()) as ApiErrorBody;
        throw new Error(data.error ?? "Failed to apply claim update");
      }

      // Refetch — the proposal widget and the original claim widget both changed
      await loadTimeline();
    },
    [loadTimeline]
  );

  return {
    ...state,
    showFiltered,
    setShowFiltered,
    loadTimeline,
    sendMessage,
    confirmClaim,
    cancelClaim,
    applyClaimUpdate,
  };
}
