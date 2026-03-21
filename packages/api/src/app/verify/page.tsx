"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";

import { setTokens } from "@/lib/client-auth";

function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phone = searchParams.get("phone") ?? "";

  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const maskedPhone = phone ? `${phone.slice(0, 5)}•••${phone.slice(-2)}` : "";

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (code.length !== 6) return;

    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Invalid code");
      }

      const data = (await res.json()) as { accessToken: string; refreshToken: string };
      setTokens(data.accessToken, data.refreshToken);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm">
        <button onClick={() => router.back()} className="mb-8 text-primary active:opacity-70">
          &larr; Back
        </button>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text-primary">Enter Code</h1>
          {maskedPhone && <p className="mt-1 text-text-secondary">Sent to {maskedPhone}</p>}
        </div>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4"
        >
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full rounded-xl border-b-2 border-primary bg-transparent py-3 text-center font-mono text-3xl tracking-[0.3em] text-text-primary outline-none"
          />

          {error && <p className="text-sm text-error">{error}</p>}

          <button
            type="submit"
            disabled={code.length !== 6 || isLoading}
            className="w-full rounded-xl bg-primary py-3.5 text-base font-semibold text-white transition-colors hover:bg-primary-dark active:bg-primary-dark disabled:opacity-50"
          >
            {isLoading ? "Verifying..." : "Verify"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <VerifyForm />
    </Suspense>
  );
}
