let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("recomp_sounds_enabled") === "1";
}

export function getSoundEnabled(): boolean {
  return isSoundEnabled();
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("recomp_sounds_enabled", enabled ? "1" : "0");
}

function playTone(freq: number, startTime: number, duration: number, gain: number, type: OscillatorType = "sine") {
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, startTime);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

export function playMealLogged(): void {
  if (!isSoundEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(523.25, t, 0.15, 0.15); // C5
  playTone(659.25, t + 0.12, 0.2, 0.12); // E5
}

export function playBadgeEarned(): void {
  if (!isSoundEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(523.25, t, 0.15, 0.12); // C5
  playTone(659.25, t + 0.1, 0.15, 0.12); // E5
  playTone(783.99, t + 0.2, 0.25, 0.14); // G5
  playTone(1046.5, t + 0.35, 0.4, 0.1, "triangle"); // C6 chord
}

export function playGoalHit(): void {
  if (!isSoundEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(880, t, 0.3, 0.12, "triangle"); // A5
}

export function playLevelUp(): void {
  if (!isSoundEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(392, t, 0.12, 0.1);        // G4
  playTone(523.25, t + 0.1, 0.12, 0.1); // C5
  playTone(659.25, t + 0.2, 0.12, 0.1); // E5
  playTone(783.99, t + 0.3, 0.12, 0.12); // G5
  playTone(1046.5, t + 0.4, 0.5, 0.14, "triangle"); // C6
}

export function playQuestComplete(): void {
  if (!isSoundEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(698.46, t, 0.12, 0.1); // F5
  playTone(880, t + 0.1, 0.25, 0.12); // A5
}
