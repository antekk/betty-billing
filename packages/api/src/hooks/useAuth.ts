"use client";

import { useState, useEffect, useCallback } from "react";

import { setTokens, clearTokens, getAccessToken } from "@/lib/client-auth";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface ApiErrorBody {
  error?: string;
}

interface VerifyOtpResponse {
  accessToken: string;
  refreshToken: string;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
  });

  const checkAuth = useCallback(() => {
    const token = getAccessToken();
    setState({ isAuthenticated: !!token, isLoading: false });
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const requestOtp = useCallback(async (phone: string) => {
    const res = await fetch("/api/auth/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });

    if (!res.ok) {
      const data = (await res.json()) as ApiErrorBody;
      throw new Error(data.error ?? "Failed to send OTP");
    }
  }, []);

  const verifyOtp = useCallback(async (phone: string, code: string): Promise<VerifyOtpResponse> => {
    const res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code }),
    });

    if (!res.ok) {
      const data = (await res.json()) as ApiErrorBody;
      throw new Error(data.error ?? "Invalid code");
    }

    const data = (await res.json()) as VerifyOtpResponse;
    setTokens(data.accessToken, data.refreshToken);
    setState({ isAuthenticated: true, isLoading: false });

    return data;
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setState({ isAuthenticated: false, isLoading: false });
  }, []);

  return {
    ...state,
    requestOtp,
    verifyOtp,
    logout,
  };
}
