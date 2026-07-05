"use client";

import { useState, useCallback, useRef } from "react";

import { apiFetch } from "@/lib/client-auth";

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
  /** User-visible failure from send/confirm/cancel/apply — shown as a banner. */
  error: string | null;
}

/** Error carrying the HTTP status so callers can tell auth failures apart. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

function newLocalId(prefix: string): string {
  // Date.now() alone collides when two SSE widgets land in the same ms
  return `${prefix}-${crypto.randomUUID()}`;
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
    error: null,
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
    if (!res.ok) throw new ApiError("Failed to load timeline", res.status);

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

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const sendMessage = useCallback(async (message: string) => {
    const tempEntry: TimelineEntry = {
      id: newLocalId("temp"),
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
      error: null,
    }));

    try {
      // apiFetch refreshes an expired access token on 401 — chat must not be
      // the one path that silently bricks after 15 minutes.
      const response = await apiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        let serverError: string | undefined;
        try {
          serverError = ((await response.json()) as ApiErrorBody).error;
        } catch {
          // Non-JSON error body — fall through to the generic message
        }
        throw new Error(serverError ?? "Your message didn't send. Please try again.");
      }

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
                  id: newLocalId("widget"),
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
                    id: newLocalId("msg"),
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

              case "error": {
                const payload = parsed as { message?: string };
                setState((prev) => ({
                  ...prev,
                  isStreaming: false,
                  streamingText: "",
                  error: payload.message ?? "Something went wrong. Please try again.",
                }));
                break;
              }
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
        error:
          error instanceof Error ? error.message : "Your message didn't send. Please try again.",
      }));
    }
  }, []);

  const confirmClaim = useCallback(
    async (claimId: string) => {
      try {
        const res = await apiFetch(`/api/claims/${claimId}/confirm`, {
          method: "POST",
        });

        if (!res.ok) {
          const data = (await res.json()) as ApiErrorBody;
          throw new Error(data.error ?? "Failed to confirm claim");
        }

        // Refetch so the widget status and Betty's acknowledgement appear
        await loadTimeline();
      } catch (error) {
        // Money-adjacent action: the physician must see why nothing happened
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : "Failed to confirm claim",
        }));
      }
    },
    [loadTimeline]
  );

  const cancelClaim = useCallback(
    async (claimId: string) => {
      try {
        const res = await apiFetch(`/api/claims/${claimId}/cancel`, {
          method: "POST",
        });

        if (!res.ok) {
          const data = (await res.json()) as ApiErrorBody;
          throw new Error(data.error ?? "Failed to cancel claim");
        }

        // Refetch so the widget and system event reflect server state
        await loadTimeline();
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : "Failed to cancel claim",
        }));
      }
    },
    [loadTimeline]
  );

  const applyClaimUpdate = useCallback(
    async (claimId: string, timelineEntryId: string) => {
      try {
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
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : "Failed to apply claim update",
        }));
      }
    },
    [loadTimeline]
  );

  return {
    ...state,
    clearError,
    showFiltered,
    setShowFiltered,
    loadTimeline,
    sendMessage,
    confirmClaim,
    cancelClaim,
    applyClaimUpdate,
  };
}
