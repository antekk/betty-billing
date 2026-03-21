"use client";

import { useState, useRef, type KeyboardEvent } from "react";

interface InputBarProps {
  onSend: (message: string) => void;
  disabled: boolean;
}

export function InputBar({ onSend, disabled }: InputBarProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit(e?: React.SyntheticEvent) {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 border-t border-border bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <textarea
        ref={textareaRef}
        rows={1}
        maxLength={5000}
        placeholder={disabled ? "Betty is typing..." : "Message Betty..."}
        disabled={disabled}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        className="max-h-[120px] min-h-[36px] flex-1 resize-none rounded-2xl bg-input-bg px-4 py-2 text-base text-text-primary outline-none placeholder:text-text-tertiary disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={!text.trim() || disabled}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-opacity disabled:opacity-40"
        aria-label="Send message"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-5 w-5"
        >
          <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95l14.095-5.638a.75.75 0 0 0 0-1.392L3.105 2.288Z" />
        </svg>
      </button>
    </form>
  );
}
