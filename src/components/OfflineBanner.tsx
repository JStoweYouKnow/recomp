"use client";

import { useState, useEffect } from "react";
import { flushPendingSync, hasPendingSync } from "@/lib/storage";

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof window !== "undefined" ? navigator.onLine : true
  );
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const refreshPending = () => setPending(hasPendingSync());
    refreshPending();
    // Boot: if a prior session left edits unsynced, push them now.
    flushPendingSync();

    const handleOnline = () => {
      setIsOnline(true);
      flushPendingSync();
      refreshPending();
    };
    const handleOffline = () => {
      setIsOnline(false);
      refreshPending();
    };
    const handleFocus = () => {
      flushPendingSync();
      refreshPending();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleFocus);
    const id = window.setInterval(refreshPending, 5000);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleFocus);
      window.clearInterval(id);
    };
  }, []);

  if (!isOnline) {
    return (
      <div
        className="bg-[var(--accent-warm)]/90 px-4 py-2 text-center text-sm text-white"
        role="status"
        aria-live="polite"
      >
        You&apos;re offline. Changes stay on this device until you&apos;re back online.
      </div>
    );
  }

  if (pending) {
    return (
      <div
        className="bg-[var(--accent)]/90 px-4 py-2 text-center text-sm text-white"
        role="status"
        aria-live="polite"
      >
        Saving your latest changes to the cloud…
      </div>
    );
  }

  return null;
}
