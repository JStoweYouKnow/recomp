"use client";

import { useState, useEffect, useCallback } from "react";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Url = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Url);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function usePushNotifications(isDemoMode: boolean) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setSupported(false);
      return;
    }
    setSupported(true);
    setPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (isDemoMode || !supported) return;
    fetch("/api/push/status")
      .then((r) => r.json())
      .then((data) => setEnabled(Boolean(data.enabled)))
      .catch(() => {});
  }, [isDemoMode, supported]);

  const enable = useCallback(async () => {
    if (!supported || isDemoMode) return;
    setLoading(true);
    setError(null);
    try {
      if (Notification.permission === "denied") {
        setError("Notifications were blocked. Enable them in your browser settings and refresh.");
        setPermission("denied");
        return;
      }
      let permission: NotificationPermission = Notification.permission;
      if (permission === "default") {
        permission = await Notification.requestPermission();
        setPermission(permission);
      }
      if (permission !== "granted") {
        setError("Permission denied.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const res = await fetch("/api/push/vapid-public");
      if (!res.ok) {
        setError("Push not available. Try again later.");
        return;
      }
      const { publicKey } = await res.json();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const subJson = sub.toJSON();
      const subscribeRes = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: {
            endpoint: subJson.endpoint,
            keys: { p256dh: subJson.keys?.p256dh, auth: subJson.keys?.auth },
          },
        }),
      });
      if (!subscribeRes.ok) {
        const data = await subscribeRes.json().catch(() => ({}));
        setError(data.error || "Could not save subscription.");
        return;
      }
      setEnabled(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [supported, isDemoMode]);

  const disable = useCallback(async () => {
    if (!supported || isDemoMode) return;
    setLoading(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      if (reg?.pushManager) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
      }
      setEnabled(false);
    } catch {
      setError("Could not disable.");
    } finally {
      setLoading(false);
    }
  }, [supported, isDemoMode]);

  return { supported, permission, enabled, loading, error, enable, disable };
}
