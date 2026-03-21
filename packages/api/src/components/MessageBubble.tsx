"use client";

import type { TimelineEntry } from "@/hooks/useChat";

export function MessageBubble({ entry }: { entry: TimelineEntry }) {
  if (entry.type === "system_event") {
    return (
      <div className="px-4 py-1 text-center text-sm italic text-text-tertiary">{entry.content}</div>
    );
  }

  const isUser = entry.direction === "inbound";

  return (
    <div className={`flex px-4 py-0.5 ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? "rounded-br-sm bg-bubble-user text-white"
            : "rounded-bl-sm bg-bubble-assistant text-text-primary"
        }`}
      >
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{entry.content}</p>
      </div>
    </div>
  );
}
