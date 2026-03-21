"use client";

import { useEffect, useRef } from "react";

import { MessageBubble } from "./MessageBubble";
import { StreamingBubble } from "./StreamingBubble";
import { TypingIndicator } from "./TypingIndicator";
import { WidgetRenderer } from "./WidgetRenderer";

import type { TimelineEntry } from "@/hooks/useChat";

interface TimelineProps {
  entries: TimelineEntry[];
  isStreaming: boolean;
  streamingText: string;
  onConfirmClaim: (claimId: string) => Promise<void>;
  onWidgetAction: (payload: string) => void;
}

export function Timeline({
  entries,
  isStreaming,
  streamingText,
  onConfirmClaim,
  onWidgetAction,
}: TimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, streamingText, isStreaming]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="py-4">
        {entries.map((entry) => {
          if (entry.type === "widget" && entry.widgetType && entry.widgetData) {
            return (
              <WidgetRenderer
                key={entry.id}
                widgetType={entry.widgetType}
                widgetData={entry.widgetData}
                onConfirmClaim={onConfirmClaim}
                onWidgetAction={onWidgetAction}
              />
            );
          }

          return <MessageBubble key={entry.id} entry={entry} />;
        })}

        {isStreaming && streamingText && <StreamingBubble text={streamingText} />}
        {isStreaming && !streamingText && <TypingIndicator />}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
