import { useState, useEffect, useCallback } from "react";
import { apiFetch, setTokens, clearTokens, getAccessToken, API_BASE } from "./api";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = useCallback(async () => {
    const token = await getAccessToken();
    setState({ isAuthenticated: !!token, isLoading: false });
  }, []);

  const requestOtp = useCallback(async (phone: string) => {
    const res = await fetch(`${API_BASE}/api/auth/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to send OTP");
    }
  }, []);

  const verifyOtp = useCallback(async (phone: string, code: string) => {
    const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Invalid code");
    }

    const data = await res.json();
    await setTokens(data.accessToken, data.refreshToken);
    setState({ isAuthenticated: true, isLoading: false });

    return data;
  }, []);

  const logout = useCallback(async () => {
    await clearTokens();
    setState({ isAuthenticated: false, isLoading: false });
  }, []);

  return {
    ...state,
    requestOtp,
    verifyOtp,
    logout,
  };
}
