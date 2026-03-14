"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  getRicoHistory,
  saveRicoHistory,
  getCoachPersona,
  saveCoachPersona,
  type CoachPersona,
  saveMeasurementTargets,
  getMeasurementTargets,
  saveMeals,
  getMeals,
  getPlan,
  savePlan,
  syncToServer
} from "@/lib/storage";
import {
  startRecording,
  startStreamingRecording,
  playAudioResponse,
  isAudioSupported,
} from "@/lib/audio-utils";
import type { RicoMessage, WorkoutExercise } from "@/lib/types";
import type { AudioRecorder, StreamingRecorder } from "@/lib/audio-utils";

/** Process Rico tool-call actions, mutate localStorage, return true if anything changed. */
function processRicoActions(actions: { type: string; payload: Record<string, unknown> }[]): boolean {
  let changed = false;
  for (const act of actions) {
    if (act.type === "update_macros") {
      const current = getMeasurementTargets();
      saveMeasurementTargets({ ...current, ...act.payload });
      changed = true;
    } else if (act.type === "log_meal") {
      const p = act.payload as { name?: string; calories?: number; protein?: number; carbs?: number; fat?: number };
      const meals = getMeals();
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v)) ? v : Math.max(0, parseInt(String(v ?? 0), 10) || 0);
      meals.push({
        id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        date: new Date().toLocaleDateString("en-CA"),
        name: typeof p?.name === "string" ? p.name : "Meal",
        mealType: "snack",
        loggedAt: new Date().toISOString(),
        macros: { calories: num(p?.calories), protein: num(p?.protein), carbs: num(p?.carbs), fat: num(p?.fat) },
      });
      saveMeals(meals);
      changed = true;
    } else if (act.type === "swap_exercise") {
      const p = act.payload as { day?: string; oldExerciseName?: string; newExerciseName?: string; newSets?: string; newReps?: string; newNotes?: string; section?: string };
      const plan = getPlan();
      if (plan && p.day && p.oldExerciseName && p.newExerciseName) {
        const dayIndex = plan.workoutPlan.weeklyPlan.findIndex((d) => d.day.toLowerCase() === p.day!.toLowerCase());
        if (dayIndex >= 0) {
          const day = plan.workoutPlan.weeklyPlan[dayIndex];
          const section = (p.section === "warmups" || p.section === "finishers") ? p.section : "exercises";
          const list: WorkoutExercise[] = (section === "warmups" ? day.warmups : section === "finishers" ? day.finishers : day.exercises) ?? [];
          const oldLower = p.oldExerciseName.toLowerCase();
          const idx = list.findIndex((ex) => ex.name.toLowerCase() === oldLower);
          if (idx >= 0) {
            list[idx] = { name: p.newExerciseName, sets: p.newSets ?? list[idx].sets, reps: p.newReps ?? list[idx].reps, notes: p.newNotes };
            if (section === "warmups") day.warmups = list;
            else if (section === "finishers") day.finishers = list;
            else day.exercises = list;
            plan.workoutPlan.weeklyPlan[dayIndex] = day;
            savePlan(plan);
            changed = true;
          }
        }
      }
    } else if (act.type === "add_exercise") {
      const p = act.payload as { day?: string; exerciseName?: string; sets?: string; reps?: string; notes?: string; section?: string };
      const plan = getPlan();
      if (plan && p.day && p.exerciseName) {
        const dayIndex = plan.workoutPlan.weeklyPlan.findIndex((d) => d.day.toLowerCase() === p.day!.toLowerCase());
        if (dayIndex >= 0) {
          const day = plan.workoutPlan.weeklyPlan[dayIndex];
          const newEx: WorkoutExercise = { name: p.exerciseName, sets: p.sets ?? "3", reps: p.reps ?? "10", notes: p.notes };
          const section = (p.section === "warmups" || p.section === "finishers") ? p.section : "exercises";
          if (section === "warmups") day.warmups = [...(day.warmups ?? []), newEx];
          else if (section === "finishers") day.finishers = [...(day.finishers ?? []), newEx];
          else day.exercises = [...day.exercises, newEx];
          plan.workoutPlan.weeklyPlan[dayIndex] = day;
          savePlan(plan);
          changed = true;
        }
      }
    } else if (act.type === "update_workout_day") {
      const p = act.payload as { day?: string; focus?: string; warmups?: WorkoutExercise[]; exercises?: WorkoutExercise[]; finishers?: WorkoutExercise[] };
      const plan = getPlan();
      if (plan && p.day && p.focus) {
        const dayIndex = plan.workoutPlan.weeklyPlan.findIndex((d) => d.day.toLowerCase() === p.day!.toLowerCase());
        if (dayIndex >= 0) {
          const day = plan.workoutPlan.weeklyPlan[dayIndex];
          day.focus = p.focus;
          if (p.warmups !== undefined) day.warmups = p.warmups;
          if (p.exercises !== undefined) day.exercises = p.exercises;
          if (p.finishers !== undefined) day.finishers = p.finishers;
          plan.workoutPlan.weeklyPlan[dayIndex] = day;
          savePlan(plan);
          changed = true;
        }
      }
    }
  }
  if (changed) {
    syncToServer();
    window.dispatchEvent(new Event("userDataUpdated"));
  }
  return changed;
}

export function RicoChat({
  userName,
  context,
  isOpen,
  onClose,
}: {
  userName: string;
  context: { streak?: number; mealsLogged?: number; xp?: number; goal?: string; recentMilestones?: string[]; biofeedbackSummary?: string | null; hydrationSummary?: string | null; activeFast?: string | null; workoutPlan?: { weeklyPlan: { day: string; focus: string; warmups?: { name: string; sets: string; reps: string; notes?: string }[]; exercises: { name: string; sets: string; reps: string; notes?: string }[]; finishers?: { name: string; sets: string; reps: string; notes?: string }[] }[] } | null };
  isOpen: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<RicoMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [persona, setPersona] = useState<CoachPersona>("default");
  const recorderRef = useRef<AudioRecorder | StreamingRecorder | null>(null);
  const streamFetchRef = useRef<Promise<Response> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(getRicoHistory());
    setPersona(getCoachPersona());
  }, []);

  useEffect(() => {
    if (messages.length > 0) saveRicoHistory(messages);
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = useCallback((msg: RicoMessage) => {
    setMessages((m) => {
      const next = [...m, msg];
      saveRicoHistory(next);
      return next;
    });
  }, []);

  const processSonicResponse = useCallback(async (res: Response) => {
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/x-ndjson")) {
      addMessage({ role: "assistant", content: "", at: new Date().toISOString() });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const audioChunks: string[] = [];
      let fullText = "";
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
              const ev = JSON.parse(line) as { type: string; content?: string; text?: string; error?: string };
              if (ev.type === "text" && ev.content) {
                fullText += ev.content;
                setStreamingContent(fullText);
              }
              if (ev.type === "audio" && ev.content) audioChunks.push(ev.content);
              if (ev.type === "done") {
                fullText = ev.text ?? fullText;
                setStreamingContent("");
                setMessages((m) => {
                  const next = [...m];
                  const last = next[next.length - 1];
                  if (last?.role === "assistant") {
                    next[next.length - 1] = { ...last, content: fullText || "I heard you, but couldn't process that. Try again?" };
                  }
                  return next;
                });
                if (audioChunks.length > 0) {
                  setIsPlaying(true);
                  try {
                    await playAudioResponse(audioChunks.join(""));
                  } catch {
                    /* playback failed */
                  }
                  setIsPlaying(false);
                }
              }
              if (ev.type === "error") throw new Error(ev.error);
            } catch (parseErr) {
              if (parseErr instanceof SyntaxError) continue;
              throw parseErr;
            }
          }
        }
      }
    } else {
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const replyText = data.text || "I heard you, but couldn't process that. Try again?";
      addMessage({ role: "assistant", content: replyText, at: new Date().toISOString() });
      if (data.audioBase64) {
        setIsPlaying(true);
        try {
          await playAudioResponse(data.audioBase64);
        } catch {
          /* playback failed */
        }
        setIsPlaying(false);
      }
    }
  }, [addMessage]);

  // Text-based send
  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    addMessage({ role: "user", content: trimmed, at: new Date().toISOString() });
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/rico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, context: { ...context, name: userName }, persona }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      addMessage({ role: "assistant", content: data.reply, at: new Date().toISOString() });

      // Execute AI Agent tool calls
      if (data.actions && Array.isArray(data.actions)) {
        processRicoActions(data.actions);
      }
    } catch (e) {
      console.error(e);
      addMessage({ role: "assistant", content: "Sorry, I'm having a moment. Try again in a sec.", at: new Date().toISOString() });
    } finally {
      setLoading(false);
    }
  };

  const PERSONA_OPTIONS: { id: CoachPersona; emoji: string; label: string }[] = [
    { id: "default", emoji: "\ud83e\udde9", label: "Default" },
    { id: "motivator", emoji: "\ud83d\udd25", label: "Hype" },
    { id: "scientist", emoji: "\ud83e\uddec", label: "Data" },
    { id: "tough_love", emoji: "\ud83d\udcaa", label: "Tough" },
    { id: "chill_friend", emoji: "\ud83d\ude0e", label: "Chill" },
  ];

  const handleStartRecording = async () => {
    try {
      const useStreamInput = true;
      if (useStreamInput) {
        const streaming = startStreamingRecording({
          mode: "chat",
          context: { ...context, name: userName },
        });
        recorderRef.current = streaming;
        streamFetchRef.current = fetch("/api/voice/sonic/stream", {
          method: "POST",
          headers: { "Content-Type": "application/x-ndjson" },
          body: streaming.stream,
        });
      } else {
        const recorder = await startRecording();
        recorderRef.current = recorder;
      }
      setIsRecording(true);
    } catch (err) {
      console.error("Mic access failed:", err);
      addMessage({ role: "assistant", content: "Couldn't access your microphone. Check browser permissions.", at: new Date().toISOString() });
    }
  };

  const handleStopRecording = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    setIsRecording(false);
    setLoading(true);
    setStreamingContent("");

    try {
      if ("stream" in recorder) {
        recorder.stop();
        recorderRef.current = null;
        const fetchPromise = streamFetchRef.current;
        streamFetchRef.current = null;
        if (!fetchPromise) throw new Error("No fetch in flight");

        addMessage({ role: "user", content: "[Voice message]", at: new Date().toISOString() });

        const res = await fetchPromise;
        await processSonicResponse(res);
      } else {
        const audioBase64 = await recorder.stop();
        recorderRef.current = null;

        addMessage({ role: "user", content: "[Voice message]", at: new Date().toISOString() });

        const res = await fetch("/api/voice/sonic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioBase64,
            mode: "chat",
            context: { ...context, name: userName },
            stream: true,
          }),
        });
        await processSonicResponse(res);
      }
    } catch (e) {
      console.error("Voice send error:", e);
      addMessage({ role: "assistant", content: "Voice processing hit a snag. Try text mode or try again.", at: new Date().toISOString() });
    } finally {
      setLoading(false);
      setStreamingContent("");
    }
  };

  const audioSupported = typeof window !== "undefined" && isAudioSupported();

  return (
    <>
      <div
        className={`modal-backdrop fixed inset-0 z-40 transition-opacity ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={`modal modal--sheet fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col rounded-tl-2xl transition-transform ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div className="h-1 w-12 rounded-full bg-[var(--border)]" aria-hidden />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-4 py-3 -mt-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)]/20 text-xl">
              🧩
            </div>
            <div>
              <h3 className="font-semibold text-[var(--foreground)]">The Ref</h3>
              <p className="text-xs text-[var(--muted)]">
                {voiceMode ? "Voice mode · Nova Sonic" : "Your AI fitness coach"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Persona picker */}
            <div className="flex gap-0.5">
              {PERSONA_OPTIONS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setPersona(p.id); saveCoachPersona(p.id); }}
                  className={`rounded-md px-1.5 py-1 text-xs transition-all ${
                    persona === p.id
                      ? "bg-[var(--accent-10)] ring-1 ring-[var(--accent)]/30 scale-110"
                      : "hover:bg-[var(--surface-elevated)] opacity-60 hover:opacity-100"
                  }`}
                  title={p.label}
                  aria-label={`Coach style: ${p.label}`}
                >
                  {p.emoji}
                </button>
              ))}
            </div>
            {audioSupported && (
              <button
                onClick={() => setVoiceMode((v) => !v)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  voiceMode
                    ? "bg-[var(--accent-terracotta)]/15 text-[var(--accent-terracotta)]"
                    : "bg-[var(--surface-elevated)] text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
                title={voiceMode ? "Switch to text" : "Switch to voice"}
              >
                {voiceMode ? "Voice" : "Text"}
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)]"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center space-y-4 animate-fade-in">
              <div className="flex justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)]">
                  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /></svg>
                </div>
              </div>
              <p className="text-sm text-[var(--muted-foreground)]">
                Hi{userName ? ` ${userName}` : ""}! Ask me anything – motivation, macros, or a gentle nudge.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {["What should I eat post-workout?", "Tips for hitting my protein goal", "Motivate me to stay consistent"].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={async () => {
                      if (loading) return;
                      addMessage({ role: "user", content: prompt, at: new Date().toISOString() });
                      setLoading(true);
                      try {
                        const res = await fetch("/api/rico", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ message: prompt, context: { ...context, name: userName }, persona }),
                        });
                        const data = await res.json();
                        if (data.error) throw new Error(data.error);
                        addMessage({ role: "assistant", content: data.reply, at: new Date().toISOString() });
                        if (data.actions?.length) {
                          processRicoActions(data.actions);
                        }
                      } catch (e) {
                        console.error(e);
                        addMessage({ role: "assistant", content: "Sorry, I'm having a moment. Try again.", at: new Date().toISOString() });
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                    className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/5 hover:text-[var(--accent)] transition-colors disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              {audioSupported && (
                <p className="text-xs text-[var(--muted)]">
                  <strong>Voice:</strong> Switch to Voice above, hold the mic to speak. Nova Sonic streams live.
                </p>
              )}
            </div>
          )}
          {messages.map((m, i) => {
            const isLastAssistant = i === messages.length - 1 && m.role === "assistant";
            const displayContent = isLastAssistant && loading && streamingContent
              ? m.content + streamingContent
              : m.content;
            return (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                  m.role === "user"
                    ? "bg-[var(--accent)]/15 text-[var(--foreground)]"
                    : "bg-[var(--surface-elevated)] text-[var(--foreground)] border-l-[3px] border-l-[var(--accent)]"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">
                  {displayContent === "[Voice message]" ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="h-4 w-4 text-[var(--accent-terracotta)]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/>
                        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                      </svg>
                      Voice message
                    </span>
                  ) : displayContent}
                </p>
              </div>
            </div>
          );})}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-[var(--surface-elevated)] px-4 py-2">
                <span className="text-sm text-[var(--muted)]">
                  {isRecording ? "Listening..." : isPlaying ? "The Ref is speaking..." : "The Ref is thinking..."}
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-[var(--border-soft)] p-4">
          {voiceMode ? (
            <div className="flex flex-col items-center gap-3">
              <button
                onMouseDown={handleStartRecording}
                onMouseUp={handleStopRecording}
                onTouchStart={handleStartRecording}
                onTouchEnd={handleStopRecording}
                disabled={loading}
                className={`flex h-16 w-16 min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-all ${
                  isRecording
                    ? "bg-[var(--accent-terracotta)] scale-110 shadow-lg animate-pulse ring-4 ring-[var(--accent-terracotta)]/30"
                    : "bg-[var(--accent)] hover:bg-[var(--accent-hover)] hover:scale-105"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                aria-label={isRecording ? "Release to send" : "Hold to talk"}
              >
                <svg className="h-7 w-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
              </button>
              <p className="text-xs text-[var(--muted)]">
                {isRecording ? "Release to send" : loading ? (isPlaying ? "Playing response..." : "Processing...") : "Hold to talk · Nova 2 Sonic"}
              </p>
            </div>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); send(); }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask The Ref..."
                disabled={loading}
                className="input-base flex-1 rounded-lg px-4 py-2 text-sm placeholder-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:shadow-[0_0_0_3px_rgba(107,124,60,0.15)] disabled:opacity-50 transition-shadow"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
