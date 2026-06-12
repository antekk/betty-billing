"use client";

import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/client-auth";

type PushStatus =
  | "unsupported" // browser can't do push, or server has no VAPID keys
  | "loading"
  | "available" // can subscribe
  | "subscribed"
  | "denied"; // user blocked notifications

interface PublicKeyResponse {
  enabled: boolean;
  publicKey: string | null;
}

function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("unsupported");
        return;
      }

      try {
        const res = await fetch("/api/push/public-key");
        const data = (await res.json()) as PublicKeyResponse;
        if (!data.enabled || !data.publicKey) {
          setStatus("unsupported");
          return;
        }
        setPublicKey(data.publicKey);

        if (Notification.permission === "denied") {
          setStatus("denied");
          return;
        }

        const registration = await navigator.serviceWorker.register("/sw.js");
        const existing = await registration.pushManager.getSubscription();
        setStatus(existing ? "subscribed" : "available");
      } catch {
        setStatus("unsupported");
      }
    }

    void init();
  }, []);

  const subscribe = useCallback(async () => {
    if (!publicKey) return;
    setStatus("loading");

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "available");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const res = await apiFetch("/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) throw new Error("Failed to store subscription");

      setStatus("subscribed");
    } catch {
      setStatus("available");
    }
  }, [publicKey]);

  const unsubscribe = useCallback(async () => {
    setStatus("loading");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await apiFetch("/api/push/subscribe", {
          method: "DELETE",
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setStatus("available");
    } catch {
      setStatus("subscribed");
    }
  }, []);

  return { status, subscribe, unsubscribe };
}
