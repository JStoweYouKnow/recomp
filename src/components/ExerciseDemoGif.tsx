"use client";

import { useState } from "react";

/** Renders an exercise demo GIF. Server returns SVG "Demo unavailable" when CDN has no GIF; onError handles network failures. */
export function ExerciseDemoGif({
  src,
  alt,
  targetMuscles,
  className = "rounded-lg max-h-28 object-contain bg-[var(--surface-elevated)]",
  containerClassName,
}: {
  src: string;
  alt: string;
  targetMuscles?: string[];
  className?: string;
  containerClassName?: string;
}) {
  const [loadFailed, setLoadFailed] = useState(false);

  if (loadFailed) {
    return (
      <div
        className={`rounded-lg flex items-center justify-center text-xs text-[var(--muted)] bg-[var(--surface-elevated)] min-h-20 ${containerClassName ?? ""}`}
      >
        Demo unavailable
      </div>
    );
  }

  return (
    <div className={containerClassName}>
      <img
        src={src}
        alt={alt}
        className={className}
        onError={() => setLoadFailed(true)}
      />
      {targetMuscles?.length ? (
        <p className="text-[10px] text-[var(--muted)] mt-1">Target: {targetMuscles.join(", ")}</p>
      ) : null}
    </div>
  );
}
