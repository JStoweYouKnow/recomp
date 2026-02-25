"use client";

import { useEffect } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { OfflineBanner } from "./OfflineBanner";
import { SkipLink } from "./SkipLink";
import { ToastProvider } from "./Toast";

export function AppWrapper({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
  }, []);

  return (
    <ErrorBoundary>
      <ToastProvider>
      <div className="flex min-h-dvh flex-col">
        <SkipLink />
        <OfflineBanner />
        <div className="flex-1">{children}</div>
        <footer className="border-t border-[var(--border-soft)] bg-[var(--surface)] py-3 text-center">
          <p className="text-xs text-[var(--muted)] px-4">
            Recomp provides general wellness guidance only. Consult a healthcare professional before starting any diet or exercise program.
          </p>
        </footer>
      </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}
