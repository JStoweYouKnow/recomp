"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { UserProfile, WorkoutLocation, WorkoutEquipment, WearableDaySummary, ProfileVisibility, SocialSettings, CoachSchedule, Supplement, BloodWork, MusicProvider, MeasurementSystem } from "@/lib/types";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { WearablesSection } from "./WearablesSection";
import { getSocialSettings, saveSocialSettings, getCoachSchedule, saveCoachSchedule, getSupplements, saveSupplements, getBloodWork, saveBloodWork, getMusicPreference, saveMusicPreference, getMeals } from "@/lib/storage";
import { syncToServer, flushSync } from "@/lib/storage";
import { v4 as uuidv4 } from "uuid";

const EQUIPMENT_OPTIONS: { value: WorkoutEquipment; label: string }[] = [
  { value: "bodyweight", label: "Bodyweight" },
  { value: "free_weights", label: "Dumbbells" },
  { value: "barbells", label: "Barbells" },
  { value: "kettlebells", label: "Kettlebells" },
  { value: "machines", label: "Machines" },
  { value: "resistance_bands", label: "Resistance bands" },
  { value: "cardio_machines", label: "Cardio" },
  { value: "pull_up_bar", label: "Pull-up bar" },
  { value: "cable_machine", label: "Cable machine" },
];

function cmToFeetInches(cm: number): { ft: number; inch: number } {
  const totalInches = cm / 2.54;
  const ft = Math.floor(totalInches / 12);
  const inch = Math.round(totalInches - ft * 12);
  return inch === 12 ? { ft: ft + 1, inch: 0 } : { ft, inch };
}

const poundsToKg = (lbs: number): number => lbs * 0.45359237;
const feetInchesToCm = (feet: number, inches: number): number => (feet * 12 + inches) * 2.54;
const kgToLbs = (kg: number): number => kg * 2.2046226218;

const AVATAR_SIZE = 192;

async function resizeImageToDataUrl(file: File, maxSize: number = AVATAR_SIZE): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

function RicoOnTheGoSection() {
  const [phoneLinked, setPhoneLinked] = useState<boolean | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [shortcutCopied, setShortcutCopied] = useState(false);

  useEffect(() => {
    fetch("/api/user/phone")
      .then((r) => r.json())
      .then((d) => setPhoneLinked(d.linked === true))
      .catch(() => {});
  }, []);

  const handleLinkPhone = async () => {
    const raw = phoneInput.replace(/\D/g, "");
    if (raw.length < 10) return;
    setPhoneLoading(true);
    try {
      const res = await fetch("/api/user/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: raw.length === 10 ? `+1${raw}` : `+${raw}` }),
      });
      const data = await res.json();
      if (res.ok) {
        setPhoneLinked(true);
        setPhoneInput("");
      }
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleUnlinkPhone = async () => {
    setPhoneLoading(true);
    try {
      const res = await fetch("/api/user/phone", { method: "DELETE" });
      if (res.ok) setPhoneLinked(false);
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleCreateToken = async () => {
    setTokenLoading(true);
    setNewToken(null);
    try {
      const res = await fetch("/api/user/api-token", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.token) setNewToken(data.token);
    } finally {
      setTokenLoading(false);
    }
  };

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const shortcutUrl = `${baseUrl}/api/rico/shortcut`;

  return (
    <div className="space-y-6">
      {/* SMS */}
      <div>
        <h4 className="text-sm font-medium text-[var(--foreground)] mb-2">Text Reco (SMS)</h4>
        <p className="text-xs text-[var(--muted)] mb-2">
          Link your phone to text Reco from anywhere. You&apos;ll need a Twilio number configured by the Refactor team.
        </p>
        {phoneLinked ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--muted-foreground)]">Phone linked</span>
            <button
              type="button"
              onClick={handleUnlinkPhone}
              disabled={phoneLoading}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--accent-terracotta)] disabled:opacity-50"
            >
              {phoneLoading ? "Unlinking…" : "Unlink"}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <input
              type="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="+1 555 123 4567"
              className="input-base flex-1 min-w-[140px] text-sm"
            />
            <button
              type="button"
              onClick={handleLinkPhone}
              disabled={phoneLoading || phoneInput.replace(/\D/g, "").length < 10}
              className="btn-secondary !py-2"
            >
              {phoneLoading ? "Linking…" : "Link phone"}
            </button>
          </div>
        )}
      </div>

      {/* Siri Shortcuts */}
      <div>
        <h4 className="text-sm font-medium text-[var(--foreground)] mb-2">Siri Shortcuts</h4>
        <p className="text-xs text-[var(--muted)] mb-2">
          Create a personal API token, then build a Shortcut that sends &quot;Ask Reco&quot; + your message to the endpoint below.
        </p>
        <div className="space-y-3">
          {newToken ? (
            <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-3 space-y-2">
              <p className="text-xs text-[var(--muted)]">Copy this token now — it won&apos;t be shown again:</p>
              <code className="block text-sm font-mono break-all bg-[var(--surface)] px-2 py-1 rounded">{newToken}</code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(newToken);
                  setShortcutCopied(true);
                  setTimeout(() => setShortcutCopied(false), 2000);
                }}
                className="btn-secondary !py-1.5 !text-xs"
              >
                {shortcutCopied ? "Copied" : "Copy token"}
              </button>
              <button type="button" onClick={() => setNewToken(null)} className="ml-2 text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
                Done
              </button>
            </div>
          ) : (
            <button type="button" onClick={handleCreateToken} disabled={tokenLoading} className="btn-secondary !py-2">
              {tokenLoading ? "Creating…" : "Generate API token"}
            </button>
          )}
          <div className="text-xs text-[var(--muted)] space-y-1">
            <p>Endpoint: <code className="bg-[var(--surface)] px-1 rounded">{shortcutUrl}</code></p>
            <p>Method: POST · Header: <code className="bg-[var(--surface)] px-1 rounded">Authorization: Bearer {'<token>'}</code></p>
            <p>Body: <code className="bg-[var(--surface)] px-1 rounded">{`{ "message": "How many calories do I need?" }`}</code></p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProfileView({
  profile,
  isDemoMode = false,
  onProfileUpdate,
  onWearableDataFetched,
}: {
  profile: UserProfile;
  isDemoMode?: boolean;
  onProfileUpdate: (p: UserProfile) => void;
  onWearableDataFetched?: (data: { date: string; provider: string; weight?: number; bodyFatPercent?: number; muscleMass?: number }[]) => void;
}) {
  const { ft, inch } = cmToFeetInches(profile.height);
  const [name, setName] = useState(profile.name);
  const [age, setAge] = useState(String(profile.age));
  const [unitSystem, setUnitSystem] = useState<MeasurementSystem>(profile.unitSystem ?? "us");
  const [weightLbs, setWeightLbs] = useState(String(Math.round(kgToLbs(profile.weight))));
  const [weightKg, setWeightKg] = useState(String(Math.round(profile.weight * 10) / 10));
  const [heightFeet, setHeightFeet] = useState(String(ft || 5));
  const [heightInches, setHeightInches] = useState(String(inch || 7));
  const [heightCm, setHeightCm] = useState(String(Math.round(profile.height)));
  const [gender, setGender] = useState(profile.gender);
  const [fitnessLevel, setFitnessLevel] = useState(profile.fitnessLevel);
  const [goal, setGoal] = useState(profile.goal);
  const [activity, setActivity] = useState(profile.dailyActivityLevel);
  const [workoutLocation, setWorkoutLocation] = useState<WorkoutLocation>(profile.workoutLocation ?? "gym");
  const [workoutEquipment, setWorkoutEquipment] = useState<WorkoutEquipment[]>(
    profile.workoutEquipment ?? ["free_weights", "machines"]
  );
  const [workoutDaysPerWeek, setWorkoutDaysPerWeek] = useState(profile.workoutDaysPerWeek ?? 4);
  const [workoutTimeframe, setWorkoutTimeframe] = useState<UserProfile["workoutTimeframe"]>(
    profile.workoutTimeframe ?? "flexible"
  );
  const [restrictions, setRestrictions] = useState(profile.dietaryRestrictions?.join(", ") ?? "");
  const [injuries, setInjuries] = useState(profile.injuriesOrLimitations?.join(", ") ?? "");
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | undefined>(profile.avatarDataUrl);
  const [calendarFeedUrl, setCalendarFeedUrl] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarCopied, setCalendarCopied] = useState(false);
  const push = usePushNotifications(isDemoMode);

  // Social settings state
  const [socialVisibility, setSocialVisibility] = useState<ProfileVisibility>("badges_only");
  const [socialUsername, setSocialUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [socialSaving, setSocialSaving] = useState(false);
  const [socialSaved, setSocialSaved] = useState(false);
  const [profileLinkCopied, setProfileLinkCopied] = useState(false);
  const usernameCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Claim Account State
  const [claimEmail, setClaimEmail] = useState(profile.email || "");
  const [claimPassword, setClaimPassword] = useState("");
  const [claimStatus, setClaimStatus] = useState<"idle" | "loading" | "success" | "error" | "conflict">("idle");
  const [claimErrorMessage, setClaimErrorMessage] = useState("");

  const handleClaimAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimEmail || claimPassword.length < 8) return;
    setClaimStatus("loading");
    setClaimErrorMessage("");
    try {
      const res = await fetch("/api/auth/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: claimEmail, password: claimPassword }),
      });
      const data = await res.json();
      if (res.status === 409) {
        // Email already belongs to an existing account — offer login
        setClaimStatus("conflict");
        setClaimErrorMessage("This email is already linked to an account.");
        return;
      }
      if (!res.ok) throw new Error(data.error || "Failed to claim account");

      setClaimStatus("success");
      onProfileUpdate({ ...profile, email: claimEmail });
      // Force immediate sync so DynamoDB has the full profile before user switches devices
      flushSync();
      setTimeout(() => setClaimStatus("idle"), 3000);
    } catch (err) {
      setClaimStatus("error");
      setClaimErrorMessage(err instanceof Error ? err.message : "Failed to claim account");
    }
  };

  const handleLoginInstead = async () => {
    setClaimStatus("loading");
    setClaimErrorMessage("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: claimEmail, password: claimPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      // Login sets the auth cookie. Clear the guest's localStorage
      // and reload — page.tsx will pull all data from DynamoDB.
      localStorage.clear();
      window.location.reload();
    } catch (err) {
      setClaimStatus("error");
      setClaimErrorMessage(err instanceof Error ? err.message : "Login failed");
    }
  };

  const handleLogout = () => {
    document.cookie = "recomp_uid=; max-age=0; path=/";
    localStorage.clear();
    window.location.reload();
  };

  const [coachSchedule, setCoachSchedule] = useState<CoachSchedule | null>(() => getCoachSchedule());
  const [checkInTimes, setCheckInTimes] = useState(coachSchedule?.checkInTimes?.join(", ") ?? "09:00, 18:00");
  const [weeklyReviewDay, setWeeklyReviewDay] = useState(coachSchedule?.weeklyReviewDay ?? 0);
  const [supplements, setSupplementsState] = useState<Supplement[]>(() => getSupplements());
  const [bloodWork, setBloodWorkState] = useState<BloodWork[]>(() => getBloodWork());
  const [musicProvider, setMusicProvider] = useState<MusicProvider>(() => getMusicPreference()?.provider ?? "spotify");
  const [supplementAnalyzeLoading, setSupplementAnalyzeLoading] = useState(false);
  const [supplementAnalyzeResult, setSupplementAnalyzeResult] = useState<{ deficiencies?: { nutrient: string; severity: string; evidence: string }[]; recommendations?: { action: string; priority: string; reason: string }[]; interactions?: string[] } | null>(null);
  const [bloodWorkParseLoading, setBloodWorkParseLoading] = useState(false);

  useEffect(() => {
    setAvatarDataUrl(profile.avatarDataUrl);
  }, [profile.avatarDataUrl]);

  useEffect(() => {
    const s = getCoachSchedule();
    if (s) {
      setCoachSchedule(s);
      setCheckInTimes(s.checkInTimes?.join(", ") ?? "09:00, 18:00");
      setWeeklyReviewDay(s.weeklyReviewDay ?? 0);
    }
  }, []);

  useEffect(() => {
    const pref = getMusicPreference();
    if (pref) setMusicProvider(pref.provider);
  }, []);

  useEffect(() => {
    if (isDemoMode || typeof window === "undefined") return;
    // Load from localStorage first
    const cached = getSocialSettings();
    if (cached) {
      setSocialVisibility(cached.visibility);
      setSocialUsername(cached.username ?? "");
    }
    // Then fetch from server
    fetch("/api/social/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.visibility) setSocialVisibility(data.visibility);
        if (data.username) setSocialUsername(data.username);
      })
      .catch(() => { });
  }, [isDemoMode]);

  const checkUsername = useCallback((value: string) => {
    if (usernameCheckTimeout.current) clearTimeout(usernameCheckTimeout.current);
    if (!value || value.length < 3) {
      setUsernameStatus("idle");
      return;
    }
    setUsernameStatus("checking");
    usernameCheckTimeout.current = setTimeout(() => {
      fetch("/api/social/username/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: value }),
      })
        .then((r) => r.json())
        .then((data) => setUsernameStatus(data.available ? "available" : "taken"))
        .catch(() => setUsernameStatus("idle"));
    }, 500);
  }, []);

  const handleSaveSocial = async () => {
    setSocialSaving(true);
    setSocialSaved(false);
    try {
      const payload: { visibility: ProfileVisibility; username?: string } = { visibility: socialVisibility };
      if (socialUsername.trim().length >= 3) payload.username = socialUsername.trim();
      const res = await fetch("/api/social/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        saveSocialSettings(data);
        setSocialSaved(true);
        setTimeout(() => setSocialSaved(false), 2000);
      }
    } catch {
      // silently fail
    } finally {
      setSocialSaving(false);
    }
  };

  useEffect(() => {
    if (isDemoMode || typeof window === "undefined") return;
    setCalendarLoading(true);
    fetch("/api/calendar/token", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data.token) {
          setCalendarFeedUrl(`${window.location.origin}/api/calendar/feed?token=${encodeURIComponent(data.token)}`);
        }
      })
      .catch(() => { })
      .finally(() => setCalendarLoading(false));
  }, [isDemoMode]);

  const handleSave = () => {
    const lbs = parseFloat(weightLbs);
    const kg = parseFloat(weightKg);
    const feet = parseInt(heightFeet, 10);
    const inches = parseInt(heightInches, 10);
    const cm = parseFloat(heightCm);
    const totalInches =
      Number.isFinite(feet) && feet > 0 ? feet * 12 + (Number.isFinite(inches) && inches >= 0 ? inches : 0) : 0;
    const weight = unitSystem === "metric"
      ? (Number.isFinite(kg) && kg > 0 ? kg : profile.weight)
      : (Number.isFinite(lbs) && lbs > 0 ? poundsToKg(lbs) : profile.weight);
    const height = unitSystem === "metric"
      ? (Number.isFinite(cm) && cm > 0 ? cm : profile.height)
      : (totalInches > 0 ? feetInchesToCm(feet, Number.isFinite(inches) ? inches : 0) : profile.height);
    onProfileUpdate({
      ...profile,
      name: name.trim() || profile.name,
      avatarDataUrl,
      age: parseInt(age, 10) || profile.age,
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
      injuriesOrLimitations: injuries.split(",").map((s) => s.trim()).filter(Boolean),
    });
  };

  const handleUnitSystemChange = (next: MeasurementSystem) => {
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
      if (Number.isFinite(kg) && kg > 0) setWeightLbs((kgToLbs(kg)).toFixed(1));
      const cm = parseFloat(heightCm);
      if (Number.isFinite(cm) && cm > 0) {
        const { ft, inch } = cmToFeetInches(cm);
        setHeightFeet(String(ft));
        setHeightInches(String(inch));
      }
    }
    setUnitSystem(next);
  };

  return (
    <div className="animate-fade-in">
      <h2 className="section-title !text-xl mb-1">Profile</h2>
      <p className="section-subtitle mb-6">Update your details anytime. Changes apply to your plan and recommendations.</p>
      <div className="card p-6">
        <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-5" noValidate>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const dataUrl = await resizeImageToDataUrl(file);
                  setAvatarDataUrl(dataUrl);
                } catch {
                  // ignore
                }
                e.target.value = "";
              }}
            />
            <div className="flex flex-col items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-[var(--border)] hover:border-[var(--accent)] bg-[var(--surface-elevated)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                aria-label="Change profile picture"
              >
                {avatarDataUrl ? (
                  <img src={avatarDataUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="flex w-full h-full items-center justify-center text-2xl font-semibold text-[var(--muted)]">
                    {name.trim() ? name.slice(0, 2).toUpperCase() : "?"}
                  </span>
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity text-white text-xs font-medium">
                  Change
                </span>
              </button>
              {avatarDataUrl && (
                <button
                  type="button"
                  onClick={() => setAvatarDataUrl(undefined)}
                  className="text-xs text-[var(--muted)] hover:text-[var(--accent-terracotta)] hover:underline"
                >
                  Remove photo
                </button>
              )}
            </div>
            <div className="flex-1 min-w-0 w-full sm:w-auto">
              <label className="label">Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-base w-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="label">Age</label>
              <input type="number" value={age} onChange={(e) => setAge(e.target.value)} min={10} max={120} className="input-base w-full" />
            </div>
            <div>
              <label className="label">Units</label>
              <select value={unitSystem} onChange={(e) => handleUnitSystemChange(e.target.value as MeasurementSystem)} className="input-base w-full">
                <option value="us">US (lb, ft/in, fl oz)</option>
                <option value="metric">Metric (kg, cm, ml)</option>
              </select>
            </div>
            {unitSystem === "metric" ? (
              <>
                <div>
                  <label className="label">Weight (kg)</label>
                  <input type="number" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} min={20} max={500} className="input-base w-full" />
                </div>
                <div>
                  <label className="label">Height (cm)</label>
                  <input type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} min={100} max={250} className="input-base w-full" />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="label">Weight (lbs)</label>
                  <input type="number" step="0.1" value={weightLbs} onChange={(e) => setWeightLbs(e.target.value)} min={50} className="input-base w-full" />
                </div>
                <div>
                  <label className="label">Height (ft)</label>
                  <input type="number" value={heightFeet} onChange={(e) => setHeightFeet(e.target.value)} min={3} max={8} className="input-base w-full" />
                </div>
                <div>
                  <label className="label">Height (in)</label>
                  <input type="number" value={heightInches} onChange={(e) => setHeightInches(e.target.value)} min={0} max={11} className="input-base w-full" />
                </div>
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Gender</label>
              <select value={gender} onChange={(e) => setGender(e.target.value as UserProfile["gender"])} className="input-base w-full">
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="label">Fitness level</label>
              <select value={fitnessLevel} onChange={(e) => setFitnessLevel(e.target.value as UserProfile["fitnessLevel"])} className="input-base w-full">
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
              <select value={goal} onChange={(e) => setGoal(e.target.value as UserProfile["goal"])} className="input-base w-full">
                <option value="lose_weight">Lose weight</option>
                <option value="maintain">Maintain</option>
                <option value="build_muscle">Build muscle</option>
                <option value="improve_endurance">Improve endurance</option>
              </select>
            </div>
            <div>
              <label className="label">Activity level</label>
              <select value={activity} onChange={(e) => setActivity(e.target.value as UserProfile["dailyActivityLevel"])} className="input-base w-full">
                <option value="sedentary">Sedentary</option>
                <option value="light">Light</option>
                <option value="moderate">Moderate</option>
                <option value="active">Active</option>
                <option value="very_active">Very active</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Workout location</label>
            <select value={workoutLocation} onChange={(e) => setWorkoutLocation(e.target.value as WorkoutLocation)} className="input-base w-full">
              <option value="home">Home</option>
              <option value="gym">Gym</option>
              <option value="outside">Outside</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Workouts per week</label>
              <select value={workoutDaysPerWeek} onChange={(e) => setWorkoutDaysPerWeek(Number(e.target.value))} className="input-base w-full">
                {[2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>{n} days</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Preferred time</label>
              <select value={workoutTimeframe} onChange={(e) => setWorkoutTimeframe(e.target.value as UserProfile["workoutTimeframe"])} className="input-base w-full">
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
                <option value="flexible">Flexible</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Equipment</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {EQUIPMENT_OPTIONS.map(({ value, label }) => (
                <label key={value} className="flex items-center gap-1.5 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={workoutEquipment.includes(value)}
                    onChange={() =>
                      setWorkoutEquipment((prev) =>
                        prev.includes(value) ? prev.filter((e) => e !== value) : [...prev, value]
                      )
                    }
                    className="rounded border-[var(--border)]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Dietary restrictions</label>
            <input type="text" value={restrictions} onChange={(e) => setRestrictions(e.target.value)} placeholder="e.g. gluten-free, vegetarian" className="input-base w-full" />
          </div>
          <div>
            <label className="label">Injuries or limitations</label>
            <input type="text" value={injuries} onChange={(e) => setInjuries(e.target.value)} placeholder="e.g. knee injury, lower back" className="input-base w-full" />
          </div>
          <button type="button" onClick={handleSave} className="btn-primary !py-2.5">
            Save changes
          </button>
        </form>
      </div>

      {/* Account Security & Claiming */}
      {!isDemoMode && (
        <div className="card p-6 mt-6 border border-[var(--active)] border-l-4 border-l-[var(--accent)] bg-[var(--surface-elevated)]/30">
          <h3 className="font-semibold text-[var(--foreground)] mb-1">Account & Security</h3>
          {!profile.email ? (
            <>
              <p className="text-sm text-[var(--muted)] mb-4">
                You are currently using an anonymous &quot;guest&quot; account. Add an email and password to securely access your data from any device.
              </p>
              <form onSubmit={handleClaimAccount} className="space-y-4">
                {claimStatus === "error" && <p className="text-sm text-[var(--accent)]">{claimErrorMessage}</p>}
                {claimStatus === "success" && <p className="text-sm text-green-500">Account successfully claimed!</p>}
                {claimStatus === "conflict" && (
                  <div className="p-3 rounded-lg border border-[var(--accent-warm)]/30 bg-[var(--accent-warm)]/5 space-y-2">
                    <p className="text-sm text-[var(--foreground)]">{claimErrorMessage}</p>
                    <p className="text-xs text-[var(--muted)]">If this is your account, you can log in to restore your data on this device.</p>
                    <button type="button" onClick={handleLoginInstead} className="btn-primary !py-2 !text-sm">
                      Log in instead
                    </button>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <label className="label">Account Email</label>
                    <input type="email" value={claimEmail} onChange={(e) => setClaimEmail(e.target.value)} required className="input-base w-full" placeholder="you@example.com" />
                  </div>
                  <div className="flex-1">
                    <label className="label">Password</label>
                    <input type="password" value={claimPassword} onChange={(e) => setClaimPassword(e.target.value)} required minLength={8} className="input-base w-full" placeholder="Min 8 characters" />
                  </div>
                </div>
                <button type="submit" disabled={claimStatus === "loading" || !claimEmail || claimPassword.length < 8} className="btn-primary !py-2.5 shadow-[var(--shadow-soft)]">
                  {claimStatus === "loading" ? "Claiming..." : "Claim Account"}
                </button>
              </form>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-[var(--muted)]">
                Your account is secured with email <strong className="text-[var(--foreground)]">{profile.email}</strong>.
              </p>
              <button type="button" onClick={handleLogout} className="btn-outline border-[var(--border)] text-[var(--muted)] hover:text-[var(--accent-terracotta)] hover:border-[var(--accent-terracotta)] !py-2 transition-colors">
                Sign out
              </button>
            </div>
          )}
        </div>
      )}

      {/* Calendar sync — iCal / Google Calendar subscribe */}
      <div className="card p-6 mt-6">
        <h3 className="font-semibold text-[var(--foreground)] mb-1">Calendar sync</h3>
        <p className="text-sm text-[var(--muted)] mb-4">
          Subscribe to your Refactor workout plan so it appears in your calendar (Apple Calendar, Google Calendar, Outlook).
        </p>
        {isDemoMode ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Complete onboarding to sync your plan to your calendar.
          </p>
        ) : calendarLoading ? (
          <p className="text-sm text-[var(--muted-foreground)]">Loading your calendar link…</p>
        ) : calendarFeedUrl ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                readOnly
                value={calendarFeedUrl}
                className="input-base flex-1 min-w-0 text-sm font-mono"
                aria-label="Calendar feed URL"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(calendarFeedUrl);
                  setCalendarCopied(true);
                  setTimeout(() => setCalendarCopied(false), 2000);
                }}
                className="btn-secondary !py-2 whitespace-nowrap"
              >
                {calendarCopied ? "Copied" : "Copy link"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://www.google.com/calendar/render?cid=${encodeURIComponent(calendarFeedUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-elevated)]/80 transition"
              >
                Add to Google Calendar
              </a>
              <a
                href={calendarFeedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-elevated)]/80 transition"
              >
                Open iCal feed
              </a>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Apple Calendar: File → New Calendar Subscription → paste the link above. Outlook: Add calendar → Subscribe from web → paste link.
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">Could not load calendar link. Try again later.</p>
        )}
      </div>

      {/* Social / Sharing */}
      <div className="card p-6 mt-6">
        <h3 className="font-semibold text-[var(--foreground)] mb-1">Sharing &amp; visibility</h3>
        <p className="text-sm text-[var(--muted)] mb-4">
          Control what others see when they visit your public profile.
        </p>
        {isDemoMode ? (
          <p className="text-sm text-[var(--muted-foreground)]">Complete onboarding to set up your public profile.</p>
        ) : (
          <div className="space-y-4">
            {/* Username */}
            <div>
              <label className="label">Username</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={socialUsername}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^a-zA-Z0-9_-]/g, "");
                    setSocialUsername(v);
                    checkUsername(v);
                  }}
                  placeholder="choose a username"
                  className="input-base flex-1"
                  maxLength={30}
                />
                {usernameStatus === "checking" && (
                  <span className="text-xs text-[var(--muted)]">checking…</span>
                )}
                {usernameStatus === "available" && (
                  <span className="text-xs text-[var(--accent)]">available</span>
                )}
                {usernameStatus === "taken" && (
                  <span className="text-xs text-[var(--accent-terracotta)]">taken</span>
                )}
              </div>
              {socialUsername.length >= 3 && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-[var(--muted)] font-mono truncate">
                    {typeof window !== "undefined" ? window.location.origin : ""}/u/{socialUsername}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/u/${socialUsername}`);
                      setProfileLinkCopied(true);
                      setTimeout(() => setProfileLinkCopied(false), 2000);
                    }}
                    className="text-xs text-[var(--accent)] hover:underline whitespace-nowrap"
                  >
                    {profileLinkCopied ? "Copied" : "Copy link"}
                  </button>
                </div>
              )}
            </div>

            {/* Visibility level */}
            <div>
              <label className="label mb-2 block">Profile visibility</label>
              <div className="space-y-2">
                {([
                  {
                    value: "badges_only" as ProfileVisibility,
                    label: "Badges & XP only",
                    desc: "Name, avatar, badges earned, XP level, and fitness goal.",
                  },
                  {
                    value: "badges_stats" as ProfileVisibility,
                    label: "Badges + summary stats",
                    desc: "Also shows streak length, weeks active, and macro hit rate.",
                  },
                  {
                    value: "full_transparency" as ProfileVisibility,
                    label: "Accountability Mode",
                    desc: "Everything above plus recent meals and workout completion. Great for accountability partners.",
                  },
                ]).map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${socialVisibility === opt.value
                        ? "border-[var(--accent)] bg-[var(--accent)]/5"
                        : "border-[var(--border)] hover:border-[var(--accent)]/50"
                      }`}
                  >
                    <input
                      type="radio"
                      name="visibility"
                      value={opt.value}
                      checked={socialVisibility === opt.value}
                      onChange={() => setSocialVisibility(opt.value)}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium text-[var(--foreground)]">{opt.label}</span>
                      <p className="text-xs text-[var(--muted)] mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveSocial}
              disabled={socialSaving || usernameStatus === "taken"}
              className="btn-primary !py-2"
            >
              {socialSaving ? "Saving…" : socialSaved ? "Saved" : "Save sharing settings"}
            </button>
          </div>
        )}
      </div>

      {/* Wearables */}
      {onWearableDataFetched && (
        <WearablesSection onDataFetched={onWearableDataFetched} />
      )}

      {/* Coach schedule */}
      <div className="card p-6 mt-6">
        <h3 className="font-semibold text-[var(--foreground)] mb-1">Coach check-ins</h3>
        <p className="text-sm text-[var(--muted)] mb-4">When to receive check-in reminders (HH:mm, comma-separated).</p>
        <input
          value={checkInTimes}
          onChange={(e) => setCheckInTimes(e.target.value)}
          placeholder="09:00, 18:00"
          className="input-base w-full max-w-xs mb-2"
        />
        <div className="flex items-center gap-2 mb-3">
          <label className="text-sm text-[var(--muted)]">Weekly review day:</label>
          <select
            value={weeklyReviewDay}
            onChange={(e) => setWeeklyReviewDay(Number(e.target.value))}
            className="input-base text-sm"
          >
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => {
            const times = checkInTimes.split(/[,\s]+/).map((t) => t.trim()).filter((t) => /^\d{1,2}:\d{2}$/.test(t));
            const next: CoachSchedule = {
              checkInTimes: times.length ? times : ["09:00"],
              lastCheckIn: coachSchedule?.lastCheckIn ?? new Date().toISOString(),
              confrontations: coachSchedule?.confrontations ?? [],
              weeklyReviewDay,
            };
            saveCoachSchedule(next);
            setCoachSchedule(next);
            syncToServer();
          }}
          className="btn-primary !py-2"
        >
          Save schedule
        </button>
      </div>

      {/* Supplements */}
      <div className="card p-6 mt-6">
        <h3 className="font-semibold text-[var(--foreground)] mb-1">Supplements</h3>
        <p className="text-sm text-[var(--muted)] mb-4">Track supplements and get AI analysis.</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {supplements.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-elevated)] px-2.5 py-1 text-xs">
              {s.name} {s.dosage}
              <button type="button" onClick={() => { const next = supplements.filter((x) => x.id !== s.id); setSupplementsState(next); saveSupplements(next); syncToServer(); }} className="text-[var(--muted)] hover:text-[var(--accent-terracotta)]">×</button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          <input
            type="text"
            placeholder="e.g. Vitamin D"
            className="input-base text-sm w-28"
            id="new-supp-name"
          />
          <input
            type="text"
            placeholder="500 IU"
            className="input-base text-sm w-20"
            id="new-supp-dosage"
          />
          <button
            type="button"
            onClick={() => {
              const name = (document.getElementById("new-supp-name") as HTMLInputElement)?.value?.trim();
              if (!name) return;
              const dosage = (document.getElementById("new-supp-dosage") as HTMLInputElement)?.value?.trim() || "—";
              const next: Supplement = { id: uuidv4(), name, dosage, frequency: "daily", timing: "morning" };
              const arr = [...supplements, next];
              setSupplementsState(arr);
              saveSupplements(arr);
              syncToServer();
              (document.getElementById("new-supp-name") as HTMLInputElement).value = "";
              (document.getElementById("new-supp-dosage") as HTMLInputElement).value = "";
            }}
            className="btn-secondary !py-1.5 !text-xs"
          >
            Add
          </button>
        </div>
        <button
          type="button"
          onClick={async () => {
            setSupplementAnalyzeLoading(true);
            setSupplementAnalyzeResult(null);
            try {
              const meals = getMeals();
              const dietSummary = meals.slice(-14).map((m) => m.name).join(", ");
              const res = await fetch("/api/supplements/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  supplements: supplements.map((s) => ({ name: s.name, dosage: s.dosage, frequency: s.frequency })),
                  bloodWork: bloodWork.length ? bloodWork : "none",
                  dietSummary,
                  goal: profile.goal,
                }),
              });
              const data = await res.json();
              if (data.error) throw new Error(data.error);
              setSupplementAnalyzeResult(data);
            } catch {
              setSupplementAnalyzeResult({ deficiencies: [], recommendations: [], interactions: [] });
            } finally {
              setSupplementAnalyzeLoading(false);
            }
          }}
          disabled={supplementAnalyzeLoading || supplements.length === 0}
          className="btn-primary !py-2 !text-sm disabled:opacity-50"
        >
          {supplementAnalyzeLoading ? "Analyzing…" : "Analyze supplements"}
        </button>
        {supplementAnalyzeResult && (
          <div className="mt-4 rounded-lg border border-[var(--border-soft)] p-3 space-y-2 text-sm animate-fade-in">
            {supplementAnalyzeResult.deficiencies?.length ? (
              <p><span className="font-medium">Deficiencies:</span> {supplementAnalyzeResult.deficiencies.map((d) => d.nutrient).join(", ")}</p>
            ) : null}
            {supplementAnalyzeResult.recommendations?.length ? (
              <ul className="list-disc list-inside">{supplementAnalyzeResult.recommendations.map((r, i) => <li key={i}>{r.action}</li>)}</ul>
            ) : null}
            {supplementAnalyzeResult.interactions?.length ? (
              <p className="text-[var(--muted)]">{supplementAnalyzeResult.interactions.join(" ")}</p>
            ) : null}
          </div>
        )}
      </div>

      {/* Blood work */}
      <div className="card p-6 mt-6">
        <h3 className="font-semibold text-[var(--foreground)] mb-1">Blood work</h3>
        <p className="text-sm text-[var(--muted)] mb-4">Upload lab results for AI extraction. Used in supplement analysis.</p>
        <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-elevated)] px-3 py-2 text-sm cursor-pointer hover:bg-[var(--surface-elevated)]/80 mb-4">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={bloodWorkParseLoading}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBloodWorkParseLoading(true);
              try {
                const { prepareImageForUpload } = await import("@/lib/image-utils");
                const blob = await prepareImageForUpload(file);
                const fd = new FormData();
                fd.append("image", blob, "bloodwork.jpg");
                const res = await fetch("/api/bloodwork/parse", { method: "POST", body: fd });
                const data = await res.json();
                if (data.error) throw new Error(data.error);
                const entry: BloodWork = {
                  id: uuidv4(),
                  date: new Date().toISOString().slice(0, 10),
                  markers: data.markers ?? [],
                  notes: "From photo upload",
                };
                setBloodWorkState((prev) => {
                  const next = [entry, ...prev];
                  saveBloodWork(next);
                  syncToServer();
                  return next;
                });
              } catch {
                // silent
              } finally {
                setBloodWorkParseLoading(false);
                e.target.value = "";
              }
            }}
          />
          {bloodWorkParseLoading ? "Parsing…" : "Upload lab results"}
        </label>
        {bloodWork.length > 0 && (
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {bloodWork.slice(0, 3).map((b) => (
              <div key={b.id} className="text-xs rounded-lg bg-[var(--surface-elevated)] p-2">
                <span className="font-medium">{b.date}</span> · {b.markers?.length ?? 0} markers
              </div>
            ))}
            {bloodWork.length > 3 && <p className="text-[10px] text-[var(--muted)]">+{bloodWork.length - 3} more</p>}
          </div>
        )}
      </div>

      {/* Music provider */}
      <div className="card p-6 mt-6">
        <h3 className="font-semibold text-[var(--foreground)] mb-1">Music for workouts</h3>
        <p className="text-sm text-[var(--muted)] mb-4">Preferred provider for workout music suggestions.</p>
        <select
          value={musicProvider}
          onChange={(e) => {
            const p = e.target.value as MusicProvider;
            setMusicProvider(p);
            saveMusicPreference({ provider: p, workoutPlaylists: getMusicPreference()?.workoutPlaylists ?? {} });
            syncToServer();
          }}
          className="input-base max-w-xs"
        >
          <option value="spotify">Spotify</option>
          <option value="apple_music">Apple Music</option>
        </select>
      </div>

      {/* Push notifications */}
      <div className="card p-6 mt-6">
        <h3 className="font-semibold text-[var(--foreground)] mb-1">Push notifications</h3>
        <p className="text-sm text-[var(--muted)] mb-4">
          Get reminders and updates from Refactor (e.g. weekly review ready, tips) in your browser.
        </p>
        {isDemoMode ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Complete onboarding to enable notifications.
          </p>
        ) : !push.supported ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Your browser does not support push notifications.
          </p>
        ) : (
          <div className="space-y-2">
            {push.error && (
              <p className="text-sm text-[var(--accent-terracotta)]" role="alert">{push.error}</p>
            )}
            {push.enabled ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-[var(--muted-foreground)]">Notifications are on.</span>
                <button
                  type="button"
                  onClick={push.disable}
                  disabled={push.loading}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
                >
                  {push.loading ? "Turning off…" : "Turn off"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={push.enable}
                disabled={push.loading || push.permission === "denied"}
                className="btn-primary !py-2"
              >
                {push.loading ? "Enabling…" : push.permission === "denied" ? "Blocked — enable in browser" : "Enable notifications"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Rico on the go — SMS, Siri Shortcuts */}
      <div className="card p-6 mt-6">
        <h3 className="font-semibold text-[var(--foreground)] mb-1">Rico on the go</h3>
        <p className="text-sm text-[var(--muted)] mb-4">
          Text Reco via SMS or use Siri Shortcuts to chat without opening the app.
        </p>
        {isDemoMode ? (
          <p className="text-sm text-[var(--muted-foreground)]">Complete onboarding to use Rico on the go.</p>
        ) : (
          <RicoOnTheGoSection />
        )}
      </div>

      {/* ── Sound Effects ── */}
      <div className="card p-5">
        <h3 className="text-h6 mb-2">Sound Effects</h3>
        <p className="text-sm text-[var(--muted)] mb-4">
          Play short chimes when you log meals, earn badges, hit goals, or level up.
        </p>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={typeof window !== "undefined" && localStorage.getItem("recomp_sounds_enabled") === "1"}
            onChange={(e) => {
              localStorage.setItem("recomp_sounds_enabled", e.target.checked ? "1" : "0");
              // Force re-render
              const ev = new Event("storage");
              window.dispatchEvent(ev);
            }}
            className="h-5 w-5 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
          />
          <span className="text-sm text-[var(--foreground)]">Enable sound effects</span>
        </label>
      </div>
    </div>
  );
}
