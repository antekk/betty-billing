"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  function formatPhone(raw: string): string {
    const digits = raw.replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  function rawDigits(formatted: string): string {
    return formatted.replace(/\D/g, "");
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    const digits = rawDigits(phone);
    if (digits.length !== 10) return;

    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: `+1${digits}` }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to send code");
      }

      router.push(`/verify?phone=${encodeURIComponent(`+1${digits}`)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  const digits = rawDigits(phone);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-text-primary">Betty</h1>
          <p className="mt-2 text-text-secondary">Your billing assistant</p>
        </div>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Phone number
            </label>
            <div className="flex items-center gap-2">
              <span className="text-base text-text-secondary">+1</span>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                autoFocus
                placeholder="(403) 555-0123"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                className="flex-1 rounded-xl border border-border bg-input-bg px-4 py-3 text-base text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {error && <p className="text-sm text-error">{error}</p>}

          <button
            type="submit"
            disabled={digits.length !== 10 || isLoading}
            className="w-full rounded-xl bg-primary py-3.5 text-base font-semibold text-white transition-colors hover:bg-primary-dark active:bg-primary-dark disabled:opacity-50"
          >
            {isLoading ? "Sending..." : "Send Code"}
          </button>
        </form>
      </div>
    </div>
  );
}
