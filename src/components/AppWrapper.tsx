"use client";

import { useEffect, useState, useCallback } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { OfflineBanner } from "./OfflineBanner";
import { SkipLink } from "./SkipLink";
import { ToastProvider } from "./Toast";
import { getTheme, saveTheme, type ThemeMode } from "@/lib/storage";

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(() =>
    typeof window !== "undefined" ? getTheme() : "light"
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggle = useCallback(() => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    saveTheme(next);
    document.documentElement.setAttribute("data-theme", next);
  }, [theme]);

  return (
    <button
      onClick={toggle}
      className="fixed top-3 right-3 z-40 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-elevated)] border border-[var(--border-soft)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface)] transition-all duration-150 shadow-[var(--shadow-soft)]"
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      {theme === "light" ? (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      )}
    </button>
  );
}

export function AppWrapper({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
    // Apply saved theme on mount
    const saved = getTheme();
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  return (
    <ErrorBoundary>
      <ToastProvider>
      <div className="flex min-h-dvh flex-col">
        <SkipLink />
        <OfflineBanner />
        <ThemeToggle />
        <main id="main-content" className="flex-1">{children}</main>
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
