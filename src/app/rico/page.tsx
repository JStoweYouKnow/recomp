"use client";

import { useEffect } from "react";

/** Redirect to main app with Rico chat open. Use as home screen shortcut: /rico */
export default function RicoShortcutPage() {
  useEffect(() => {
    window.location.replace("/?open=rico");
  }, []);
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
      <p className="text-[var(--muted)]">Opening Reco…</p>
    </div>
  );
}
