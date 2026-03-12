"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  startStreamingRecording,
  playAudioResponse,
  isAudioSupported,
} from "@/lib/audio-utils";
import type { StreamingRecorder } from "@/lib/audio-utils";
import type { UserProfile, WorkoutLocation, WorkoutEquipment } from "@/lib/types";
import { NovaTracePanel } from "@/components/judge/NovaTracePanel";

const EQUIPMENT_OPTIONS: { value: WorkoutEquipment; label: string }[] = [
  { value: "bodyweight", label: "Bodyweight" },
  { value: "free_weights", label: "Dumbbells" },
  { value: "barbells", label: "Barbells" },
  { value: "kettlebells", label: "Kettlebells" },
  { value: "machines", label: "Machines" },
  { value: "resistance_bands", label: "Resistance bands" },
  { value: "cardio_machines", label: "Cardio (treadmill, bike)" },
  { value: "pull_up_bar", label: "Pull-up bar" },
  { value: "cable_machine", label: "Cable machine" },
];

const FEATURES = [
  { image: "/feature-diet.jpg", title: "Personalized diet", desc: "Macro targets & meal plans tailored to your goal" },
  { image: "/feature-workouts.jpg", title: "Smart workouts", desc: "Plans that match your equipment & schedule" },
  { image: "/feature-logging.jpg", title: "Voice & photo logging", desc: "Log meals by speaking or snapping your plate" },
  { image: "/feature-wearable.jpg", title: "Wearable sync", desc: "Oura, Fitbit, Apple Health & more" },
  { image: "/feature-reco.jpg", title: "AI coach Reco", desc: "Guidance, tips & weekly reviews" },
];

export function LandingPage({
  onSubmit,
  onLoginSuccess,
  loading,
  onUsePreseededDemo,
  onStartJudgeTour,
  onResetDemoData,
}: {
  onSubmit: (d: Partial<UserProfile> & { password?: string }) => void;
  onLoginSuccess: (userId: string) => void;
  loading: boolean;
  onUsePreseededDemo: () => void;
  onStartJudgeTour: () => void;
  onResetDemoData: () => void;
}) {
  const poundsToKg = (lbs: number): number => lbs * 0.45359237;
  const kgToPounds = (kg: number): number => kg * 2.2046226218;
  const feetInchesToCm = (feet: number, inches: number): number => (feet * 12 + inches) * 2.54;
  const cmToFeetInches = (cm: number): { feet: number; inches: number } => {
    const totalInches = cm / 2.54;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches - feet * 12);
    return inches === 12 ? { feet: feet + 1, inches: 0 } : { feet, inches };
  };

  const [mode, setMode] = useState<"choose" | "signup" | "login">("choose");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [age, setAge] = useState("");
  const [unitSystem, setUnitSystem] = useState<"us" | "metric">("us");
  const [weightLbs, setWeightLbs] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [heightFeet, setHeightFeet] = useState("");
  const [heightInches, setHeightInches] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [gender, setGender] = useState<UserProfile["gender"]>("other");
  const [fitnessLevel, setFitnessLevel] = useState<UserProfile["fitnessLevel"]>("intermediate");
  const [goal, setGoal] = useState<UserProfile["goal"]>("maintain");
  const [activity, setActivity] = useState<UserProfile["dailyActivityLevel"]>("moderate");
  const [workoutLocation, setWorkoutLocation] = useState<WorkoutLocation>("gym");
  const [workoutEquipment, setWorkoutEquipment] = useState<WorkoutEquipment[]>(["free_weights", "machines"]);
  const [workoutDaysPerWeek, setWorkoutDaysPerWeek] = useState(4);
  const [workoutTimeframe, setWorkoutTimeframe] = useState<UserProfile["workoutTimeframe"]>("flexible");
  const [restrictions, setRestrictions] = useState("");

  const toggleEquipment = (eq: WorkoutEquipment) => {
    setWorkoutEquipment((prev) => (prev.includes(eq) ? prev.filter((e) => e !== eq) : [...prev, eq]));
  };

  /* ── Voice onboarding via Nova Sonic ── */
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceMessages, setVoiceMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const recorderRef = useRef<StreamingRecorder | null>(null);
  const fetchRef = useRef<Promise<Response> | null>(null);
  const [showVoiceToggle, setShowVoiceToggle] = useState(false);
  useEffect(() => {
    setShowVoiceToggle(isAudioSupported());
  }, []);

  const voiceSystemPrompt = `You are Reco, the onboarding assistant for Recomp, an AI fitness app. You're having a friendly voice conversation to gather the user's profile info. Ask one question at a time. You need: name, age, weight, height, gender, fitness level (beginner/intermediate/advanced), goal (lose weight/maintain/build muscle/improve endurance), activity level (sedentary/light/moderate/active/very active), where they work out (home/gym/outside), and any dietary restrictions. Users may answer in US or metric units. Convert to the output schema below (weightLbs + heightFt/heightIn). After gathering all info, respond with EXACTLY this JSON format on its own line: ONBOARD_DATA:{"name":"...","age":30,"weightLbs":154,"heightFt":5,"heightIn":7,"gender":"male","fitnessLevel":"intermediate","goal":"build_muscle","activityLevel":"moderate","workoutLocation":"gym","restrictions":""}. Start by greeting them and asking their name.`;

  const handleVoiceStart = useCallback(async () => {
    try {
      const streaming = startStreamingRecording({
        mode: "chat",
        context: { systemOverride: voiceSystemPrompt, history: voiceMessages },
      });
      recorderRef.current = streaming;
      fetchRef.current = fetch("/api/voice/sonic/stream", {
        method: "POST",
        headers: { "Content-Type": "application/x-ndjson" },
        body: streaming.stream,
      });
      setIsRecording(true);
    } catch {
      setVoiceMessages((m) => [...m, { role: "assistant", text: "Couldn't access microphone. Please check permissions or use the form instead." }]);
    }
  }, [voiceMessages]);

  const handleVoiceStop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorder.stop();
    recorderRef.current = null;
    setIsRecording(false);
    setVoiceProcessing(true);

    try {
      const res = await fetchRef.current;
      fetchRef.current = null;
      if (!res) throw new Error("No response");

      setVoiceMessages((m) => [...m, { role: "user", text: "[Voice message]" }]);

      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/x-ndjson")) {
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";
        const audioChunks: string[] = [];
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const ev = JSON.parse(line);
                if (ev.type === "text" && ev.content) fullText += ev.content;
                if (ev.type === "audio" && ev.content) audioChunks.push(ev.content);
                if (ev.type === "done") fullText = ev.text ?? fullText;
              } catch { continue; }
            }
          }
        }

        setVoiceMessages((m) => [...m, { role: "assistant", text: fullText || "I didn't catch that. Try again?" }]);

        // Check for completed onboarding data
        const dataMatch = fullText.match(/ONBOARD_DATA:(\{[\s\S]*?\})/);
        if (dataMatch) {
          try {
            const parsed = JSON.parse(dataMatch[1]);
            const poundsToKg = (lbs: number): number => lbs * 0.45359237;
            const kgToPounds = (kg: number): number => kg * 2.2046226218;
            const feetInchesToCm = (feet: number, inches: number): number => (feet * 12 + inches) * 2.54;
            const cmToFeetInches = (cm: number): { feet: number; inches: number } => {
              const totalInches = cm / 2.54;
              const feet = Math.floor(totalInches / 12);
              const inches = Math.round(totalInches - feet * 12);
              return inches === 12 ? { feet: feet + 1, inches: 0 } : { feet, inches };
            };
            const hasMetricFields = Number.isFinite(parsed.weightKg) || Number.isFinite(parsed.heightCm);
            const weightLbs = Number.isFinite(parsed.weightLbs)
              ? parsed.weightLbs
              : (Number.isFinite(parsed.weightKg) ? kgToPounds(parsed.weightKg) : 154);
            const heightFromMetric = Number.isFinite(parsed.heightCm) ? cmToFeetInches(parsed.heightCm) : null;
            const heightFt = Number.isFinite(parsed.heightFt)
              ? parsed.heightFt
              : (heightFromMetric?.feet ?? 5);
            const heightIn = Number.isFinite(parsed.heightIn)
              ? parsed.heightIn
              : (heightFromMetric?.inches ?? 7);
            onSubmit({
              name: parsed.name || "User",
              age: parsed.age || 30,
              weight: poundsToKg(weightLbs),
              height: feetInchesToCm(heightFt, heightIn),
              gender: parsed.gender || "other",
              fitnessLevel: parsed.fitnessLevel || "intermediate",
              goal: parsed.goal || "maintain",
              dailyActivityLevel: parsed.activityLevel || "moderate",
              unitSystem: hasMetricFields ? "metric" : "us",
              workoutLocation: parsed.workoutLocation || "gym",
              dietaryRestrictions: parsed.restrictions ? parsed.restrictions.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
            });
            return;
          } catch { /* parsing failed, continue conversation */ }
        }

        if (audioChunks.length > 0) {
          try { await playAudioResponse(audioChunks.join("")); } catch { /* playback failed */ }
        }
      } else {
        const data = await res.json();
        setVoiceMessages((m) => [...m, { role: "assistant", text: data.text || "I didn't catch that." }]);
      }
    } catch {
      setVoiceMessages((m) => [...m, { role: "assistant", text: "Voice processing failed. Try again or use the form." }]);
    } finally {
      setVoiceProcessing(false);
    }
  }, [onSubmit]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lbs = parseFloat(weightLbs);
    const kg = parseFloat(weightKg);
    const feet = parseInt(heightFeet, 10);
    const inches = parseInt(heightInches, 10);
    const cm = parseFloat(heightCm);
    const totalInches = Number.isFinite(feet) && feet > 0
      ? feet * 12 + (Number.isFinite(inches) && inches >= 0 ? inches : 0)
      : 0;
    const weight = unitSystem === "metric"
      ? (Number.isFinite(kg) && kg > 0 ? kg : 70)
      : (Number.isFinite(lbs) && lbs > 0 ? poundsToKg(lbs) : 70);
    const height = unitSystem === "metric"
      ? (Number.isFinite(cm) && cm > 0 ? cm : 170)
      : (totalInches > 0 ? feetInchesToCm(feet, Number.isFinite(inches) ? inches : 0) : 170);
    onSubmit({
      name: name || "User",
      email: email || undefined,
      password: password || undefined,
      age: parseInt(age) || 30,
      weight,
      height,
      gender,
      fitnessLevel,
      goal,
      dailyActivityLevel: activity,
      unitSystem,
      workoutLocation,
      workoutEquipment,
      workoutDaysPerWeek,
      workoutTimeframe,
      dietaryRestrictions: restrictions.split(",").map((s) => s.trim()).filter(Boolean),
    });
  };

  const handleUnitSystemChange = (next: "us" | "metric") => {
    if (next === unitSystem) return;
    if (next === "metric") {
      const lbs = parseFloat(weightLbs);
      if (Number.isFinite(lbs) && lbs > 0) setWeightKg((poundsToKg(lbs)).toFixed(1));
      const feet = parseInt(heightFeet, 10);
      const inches = parseInt(heightInches, 10);
      const totalInches = Number.isFinite(feet) && feet > 0
        ? feet * 12 + (Number.isFinite(inches) && inches >= 0 ? inches : 0)
        : 0;
      if (totalInches > 0) setHeightCm((feetInchesToCm(feet, Number.isFinite(inches) ? inches : 0)).toFixed(0));
    } else {
      const kg = parseFloat(weightKg);
      if (Number.isFinite(kg) && kg > 0) setWeightLbs((kgToPounds(kg)).toFixed(1));
      const cm = parseFloat(heightCm);
      if (Number.isFinite(cm) && cm > 0) {
        const { feet, inches } = cmToFeetInches(cm);
        setHeightFeet(String(feet));
        setHeightInches(String(inches));
      }
    }
    setUnitSystem(next);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }
      onLoginSuccess(data.userId);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoginLoading(false);
    }
  };

  if (mode === "login") {
    return (
      <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center p-5">
        <div className="card w-full max-w-sm p-6 sm:p-8 space-y-6">
          <div className="text-center">
            <h2 className="brand-title text-2xl font-bold text-[var(--foreground)]">Welcome back</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Log in to pick up where you left off</p>
          </div>
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            {loginError && <p className="text-sm text-[var(--accent)] text-center">{loginError}</p>}
            <div>
              <label className="label">Email</label>
              <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required className="input-base w-full" />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required className="input-base w-full" />
            </div>
            <button type="submit" disabled={loginLoading} className="btn-primary w-full shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-medium)]">
              {loginLoading ? "Logging in..." : "Log In"}
            </button>
          </form>
          <div className="text-center text-sm">
            <span className="text-[var(--muted)]">Don&apos;t have an account? </span>
            <button onClick={() => setMode("choose")} className="text-[var(--accent)] hover:underline font-medium">Get started</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--accent)]/[0.03] via-transparent to-[var(--accent-terracotta)]/[0.04]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full bg-[var(--accent)]/[0.06] blur-3xl" />
      </div>

      <header className="border-b border-[var(--border-soft)] bg-[var(--background)]/90 backdrop-blur-md sticky top-0 z-20" role="banner">
        <div className="mx-auto max-w-4xl px-5 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-xl" aria-hidden="true">🧩</span>
            <span className="brand-title !text-lg text-[var(--accent)] leading-none">Recomp</span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-soft)] bg-[var(--surface-elevated)]/80 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden />
            Amazon Nova AI Hackathon
          </span>
        </div>
      </header>

      <section className="px-5 pt-16 pb-12 sm:pt-20 sm:pb-16 text-center">
        <h1
          className="brand-title text-balance text-[var(--foreground)] font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl tracking-tight leading-[1.05] max-w-4xl mx-auto animate-fade-in relative inline-block"
          style={{ animationDelay: "0ms" }}
        >
          Your AI-powered{" "}
          <span className="text-[var(--accent)] block sm:inline sm:ml-2 relative">
            body recomposition
            <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-80 animate-fade-in" style={{ animationDelay: "200ms" }} aria-hidden />
          </span>
          {" "}companion
        </h1>
        <p
          className="mt-6 text-[var(--muted-foreground)] font-medium text-lg sm:text-xl max-w-xl mx-auto leading-relaxed animate-fade-in"
          style={{ animationDelay: "80ms" }}
        >
          Personalized diet &amp; workout plans, meal tracking, wearable insights, and an AI coach—all in one place.
        </p>
      </section>

      <section className="px-5 pb-16">
        <div className="mx-auto max-w-4xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="rounded-xl border border-[var(--border-soft)] bg-[var(--card-bg)]/80 backdrop-blur-sm p-4 shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-medium)] hover:border-[var(--accent)]/20 transition-all duration-200 animate-fade-in"
                style={{ animationDelay: `${120 + i * 50}ms` }}
              >
                <div className="h-14 w-14 rounded-xl overflow-hidden bg-[var(--surface-elevated)] flex-shrink-0">
                  <img
                    src={f.image}
                    alt=""
                    className="h-full w-full object-cover"
                    role="presentation"
                  />
                </div>
                <h3 className="mt-2 font-medium text-[var(--foreground)] text-sm">{f.title}</h3>
                <p className="mt-1 text-[var(--muted)] text-xs leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-20">
        <div className="mx-auto max-w-lg">
          <NovaTracePanel />

          {/* Judges / evaluators: one-click instant demo — prominent above form */}
          <div className="mb-8 p-4 rounded-xl border-2 border-[var(--accent)]/30 bg-[var(--accent)]/5 animate-fade-in" style={{ animationDelay: "320ms" }}>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">For judges & evaluators</p>
            <p className="mt-1 text-sm text-[var(--foreground)]">One-click instant demo — no signup. Loads 7-day sample data with auth cookie for AI routes.</p>
            <ol className="mt-3 space-y-1 text-xs text-[var(--muted)] list-decimal list-inside">
              <li>Start guided judge tour (auto-seeds demo account).</li>
              <li>Dashboard: open Evidence card and click Show metrics.</li>
              <li>Meals: add one sample meal (text/voice/photo).</li>
              <li>Dashboard: generate Weekly AI Review.</li>
              <li>Reco: send one message (or voice).</li>
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onStartJudgeTour}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/5 transition-colors"
              >
                Start guided judge tour
              </button>
              <button
                type="button"
                onClick={onUsePreseededDemo}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent)]/90 transition-colors"
              >
                <span className="h-2 w-2 rounded-full bg-white animate-pulse" aria-hidden />
                Try pre-seeded demo
              </button>
              <button
                type="button"
                onClick={onResetDemoData}
                className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:underline"
              >
                Reset local demo data
              </button>
            </div>
          </div>

          <div className="text-center mb-6 animate-fade-in" style={{ animationDelay: "350ms" }}>
            <h2 className="brand-title text-2xl sm:text-3xl md:text-4xl font-bold text-[var(--foreground)] tracking-tight">
              Create your personalized plan
            </h2>
            <div className="mt-4 flex flex-col items-center gap-3">
              {mode === "choose" ? (
                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={() => setMode("signup")} className="btn-primary px-8 py-3 w-full sm:w-auto shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-medium)] text-base">
                    Get Started -&gt;
                  </button>
                  <button onClick={() => setMode("login")} className="btn-outline px-8 py-3 w-full sm:w-auto text-[var(--accent)] border-[var(--border-soft)] hover:bg-[var(--surface-elevated)] transition-colors text-base font-medium">
                    Log In
                  </button>
                </div>
              ) : (
                <button onClick={() => setMode("choose")} className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] mt-2">
                  ← Back
                </button>
              )}
            </div>
          </div>
          {/* Voice / Form toggle — only after mount to avoid hydration mismatch */}
          {mode === "signup" && showVoiceToggle && (
            <div className="flex flex-col items-center mb-4 animate-fade-in" style={{ animationDelay: "380ms" }}>
              <p className="text-xs text-[var(--muted)] mb-2">Answer by typing or by voice</p>
              <div className="inline-flex rounded-lg border border-[var(--border-soft)] bg-[var(--surface-elevated)] p-0.5">
                <button
                  type="button"
                  onClick={() => setVoiceMode(false)}
                  className={`rounded-md px-4 py-1.5 text-xs font-medium transition ${!voiceMode ? "bg-[var(--accent)] text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
                >
                  Form
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceMode(true)}
                  className={`rounded-md px-4 py-1.5 text-xs font-medium transition ${voiceMode ? "bg-[var(--accent)] text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
                >
                  Voice
                </button>
              </div>
            </div>
          )}

          {voiceMode ? (
            <div className="card p-6 sm:p-8 animate-fade-in" style={{ animationDelay: "400ms" }}>
              <div className="text-center mb-6">
                <p className="text-sm text-[var(--muted)]">Talk with Reco to set up your profile — no typing needed. Powered by Nova 2 Sonic.</p>
              </div>
              <div className="space-y-3 max-h-64 overflow-y-auto mb-6">
                {voiceMessages.length === 0 && (
                  <p className="text-center text-sm text-[var(--muted)]">Hold the mic button, then answer Reco&apos;s questions out loud. Release when you finish speaking.</p>
                )}
                {voiceMessages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${m.role === "user" ? "bg-[var(--accent)]/15" : "bg-[var(--surface-elevated)]"
                      }`}>
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onMouseDown={handleVoiceStart}
                  onMouseUp={handleVoiceStop}
                  onTouchStart={handleVoiceStart}
                  onTouchEnd={handleVoiceStop}
                  disabled={voiceProcessing || loading}
                  className={`flex h-16 w-16 items-center justify-center rounded-full transition-all ${isRecording ? "bg-[var(--accent-terracotta)] scale-110 shadow-lg animate-pulse" : "bg-[var(--accent)] hover:bg-[var(--accent-hover)] hover:scale-105"
                    } disabled:opacity-50`}
                  aria-label={isRecording ? "Release to send" : "Hold to talk"}
                >
                  <svg className="h-7 w-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                  </svg>
                </button>
                <p className="text-xs text-[var(--muted)]">
                  {isRecording ? "Release to send" : voiceProcessing ? "Processing..." : "Hold to talk · Nova 2 Sonic"}
                </p>
              </div>
              <div className="mt-4 text-center">
                <button type="button" onClick={() => setVoiceMode(false)} className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
                  Switch to form instead
                </button>
              </div>
            </div>
          ) : mode === "signup" ? (
            <div className="card p-6 sm:p-8 animate-fade-in" style={{ animationDelay: "400ms" }}>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2 pb-4 border-b border-[var(--border-soft)]">
                  <div>
                    <label className="label">Account Email (Optional)</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" className="input-base w-full" />
                    <p className="text-[10px] text-[var(--muted)] mt-1">To access your data across devices</p>
                  </div>
                  <div>
                    <label className="label">Password (Optional)</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 8 characters" className="input-base w-full" />
                  </div>
                </div>
                <div>
                  <label className="label">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="input-base w-full"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <span className="label">Units</span>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer bg-[var(--surface-elevated)] p-2 rounded-lg border border-[var(--border-soft)] hover:border-[var(--accent)]/50 transition-colors">
                      <input
                        type="radio"
                        name="unitSystem"
                        value="us"
                        checked={unitSystem === "us"}
                        onChange={() => handleUnitSystemChange("us")}
                        className="w-4 h-4 cursor-pointer accent-[var(--accent)]"
                      />
                      <span className="text-sm">US (lb, ft/in)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer bg-[var(--surface-elevated)] p-2 rounded-lg border border-[var(--border-soft)] hover:border-[var(--accent)]/50 transition-colors">
                      <input
                        type="radio"
                        name="unitSystem"
                        value="metric"
                        checked={unitSystem === "metric"}
                        onChange={() => handleUnitSystemChange("metric")}
                        className="w-4 h-4 cursor-pointer accent-[var(--accent)]"
                      />
                      <span className="text-sm">Metric (kg, cm)</span>
                    </label>
                  </div>
                </div>

                <div className={`grid grid-cols-2 ${unitSystem === "us" ? "sm:grid-cols-4" : "sm:grid-cols-3"} gap-3`}>
                  <div>
                    <label className="label">Age</label>
                    <input
                      type="number"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      placeholder="30"
                      className="input-base w-full"
                    />
                  </div>
                  {unitSystem === "metric" ? (
                    <>
                      <div>
                        <label className="label">Weight (kg)</label>
                        <input
                          type="number"
                          step="0.1"
                          min={20}
                          max={500}
                          value={weightKg}
                          onChange={(e) => setWeightKg(e.target.value)}
                          placeholder="70"
                          className="input-base w-full"
                        />
                      </div>
                      <div>
                        <label className="label">Height (cm)</label>
                        <input
                          type="number"
                          step="1"
                          min={100}
                          max={250}
                          value={heightCm}
                          onChange={(e) => setHeightCm(e.target.value)}
                          placeholder="170"
                          className="input-base w-full"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="label">Weight (lbs)</label>
                        <input
                          type="number"
                          step="0.1"
                          min={50}
                          max={1000}
                          value={weightLbs}
                          onChange={(e) => setWeightLbs(e.target.value)}
                          placeholder="154"
                          className="input-base w-full"
                        />
                      </div>
                      <div>
                        <label className="label">Height (ft)</label>
                        <input
                          type="number"
                          min={3}
                          max={8}
                          value={heightFeet}
                          onChange={(e) => setHeightFeet(e.target.value)}
                          placeholder="5"
                          className="input-base w-full"
                        />
                      </div>
                      <div>
                        <label className="label">Height (in)</label>
                        <input
                          type="number"
                          min={0}
                          max={11}
                          value={heightInches}
                          onChange={(e) => setHeightInches(e.target.value)}
                          placeholder="7"
                          className="input-base w-full"
                        />
                      </div>
                    </>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Gender</label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value as UserProfile["gender"])}
                      className="input-base w-full"
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Fitness level</label>
                    <select
                      value={fitnessLevel}
                      onChange={(e) => setFitnessLevel(e.target.value as UserProfile["fitnessLevel"])}
                      className="input-base w-full"
                    >
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                      <option value="athlete">Athlete</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Goal</label>
                    <select
                      value={goal}
                      onChange={(e) => setGoal(e.target.value as UserProfile["goal"])}
                      className="input-base w-full"
                    >
                      <option value="lose_weight">Lose weight</option>
                      <option value="maintain">Maintain</option>
                      <option value="build_muscle">Build muscle</option>
                      <option value="improve_endurance">Improve endurance</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Activity level</label>
                    <select
                      value={activity}
                      onChange={(e) => setActivity(e.target.value as UserProfile["dailyActivityLevel"])}
                      className="input-base w-full"
                    >
                      <option value="sedentary">Sedentary</option>
                      <option value="light">Light</option>
                      <option value="moderate">Moderate</option>
                      <option value="active">Active</option>
                      <option value="very_active">Very active</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">Where do you work out?</label>
                  <select
                    value={workoutLocation}
                    onChange={(e) => setWorkoutLocation(e.target.value as WorkoutLocation)}
                    className="input-base w-full"
                  >
                    <option value="home">Home</option>
                    <option value="gym">Gym</option>
                    <option value="outside">Outside (parks, trails)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Workouts per week</label>
                    <select
                      value={workoutDaysPerWeek}
                      onChange={(e) => setWorkoutDaysPerWeek(Number(e.target.value))}
                      className="input-base w-full"
                    >
                      {[2, 3, 4, 5, 6, 7].map((n) => (
                        <option key={n} value={n}>
                          {n} days
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Preferred workout time</label>
                    <select
                      value={workoutTimeframe}
                      onChange={(e) => setWorkoutTimeframe(e.target.value as UserProfile["workoutTimeframe"])}
                      className="input-base w-full"
                    >
                      <option value="morning">Morning</option>
                      <option value="afternoon">Afternoon</option>
                      <option value="evening">Evening</option>
                      <option value="flexible">Flexible</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">Equipment you have access to</label>
                  <p className="text-xs text-[var(--muted)] mb-1">Select all that apply — you can change this anytime in Profile.</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {EQUIPMENT_OPTIONS.map(({ value, label }) => (
                      <label key={value} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={workoutEquipment.includes(value)}
                          onChange={() => toggleEquipment(value)}
                          className="rounded border-[var(--border)]"
                        />
                        <span className="text-sm">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Dietary restrictions</label>
                  <input
                    type="text"
                    value={restrictions}
                    onChange={(e) => setRestrictions(e.target.value)}
                    placeholder="e.g. gluten-free, vegetarian"
                    className="input-base w-full"
                  />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full !py-4 !text-base font-semibold shadow-[var(--shadow-medium)] hover:shadow-[var(--shadow-strong)] transition-shadow">
                  {loading ? "Generating your plan with Amazon Nova…" : "Create my plan"}
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </section>

      <footer className="py-8 text-center border-t border-[var(--border-soft)]">
        <p className="text-xs text-[var(--muted)]">Built for the Amazon Nova AI Hackathon · Powered by Nova 2 Lite, Sonic, Canvas &amp; more</p>
      </footer>
    </div>
  );
}
