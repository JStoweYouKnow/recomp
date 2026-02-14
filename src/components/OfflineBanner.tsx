"use client";

import { useState, useEffect } from "react";

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      className="bg-[var(--accent-warm)]/90 px-4 py-2 text-center text-sm text-white"
      role="status"
      aria-live="polite"
    >
      You&apos;re offline. Some features may not work until your connection is restored.
    </div>
  );
}
