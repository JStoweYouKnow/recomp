"use client";

import { useState, useCallback, useRef, useEffect } from "react";

const COLORS = [
  "#6b7c3c", // sage
  "#7d8c4a", // accent-sage
  "#b8956b", // warm
  "#9b7b6c", // terracotta
  "#d4a853", // olive gold
  "#8b9e52", // light sage
  "#c49a6c", // light warm
];

const SHAPES = ["square", "circle", "strip"] as const;

interface Particle {
  id: number;
  x: number;
  color: string;
  shape: typeof SHAPES[number];
  delay: number;
  duration: number;
  size: number;
  rotation: number;
  drift: number;
}

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
    delay: Math.random() * 0.6,
    duration: 1.8 + Math.random() * 1.2,
    size: 6 + Math.random() * 6,
    rotation: Math.random() * 360,
    drift: -30 + Math.random() * 60,
  }));
}

function ConfettiOverlay({ active, onDone }: { active: boolean; onDone: () => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!active) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(onDone, 3200);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [active, onDone]);

  if (!active) return null;

  const particles = generateParticles(55);

  return (
    <div
      className="fixed inset-0 z-[100] pointer-events-none overflow-hidden confetti-container"
      aria-hidden="true"
    >
      {particles.map((p) => (
        <span
          key={p.id}
          className="confetti-particle"
          style={{
            left: `${p.x}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            ["--drift" as string]: `${p.drift}px`,
            ["--rotation" as string]: `${p.rotation}deg`,
            width: p.shape === "strip" ? `${p.size * 0.4}px` : `${p.size}px`,
            height: p.shape === "strip" ? `${p.size * 1.6}px` : `${p.size}px`,
            backgroundColor: p.color,
            borderRadius: p.shape === "circle" ? "50%" : p.shape === "strip" ? "2px" : "1px",
          }}
        />
      ))}
    </div>
  );
}

export function useConfetti() {
  const [active, setActive] = useState(false);

  const trigger = useCallback(() => {
    setActive(true);
  }, []);

  const overlay = (
    <ConfettiOverlay active={active} onDone={() => setActive(false)} />
  );

  return { trigger, ConfettiOverlay: overlay };
}
