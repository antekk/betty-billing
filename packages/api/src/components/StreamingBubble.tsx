"use client";

export function StreamingBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-start px-4 py-0.5">
      <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-bubble-assistant px-4 py-2.5">
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-text-primary">
          {text}
          <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-text-tertiary" />
        </p>
      </div>
    </div>
  );
}
