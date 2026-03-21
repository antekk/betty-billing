"use client";

export function TypingIndicator() {
  return (
    <div className="flex justify-start px-4 py-0.5">
      <div className="flex gap-1.5 rounded-2xl rounded-bl-sm bg-bubble-assistant px-4 py-3">
        <span className="h-2 w-2 animate-bounce rounded-full bg-text-tertiary [animation-delay:0ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-text-tertiary [animation-delay:150ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-text-tertiary [animation-delay:300ms]" />
      </div>
    </div>
  );
}
