"use client";

import { useState } from "react";
import type { UserProfile, WorkoutLocation, WorkoutEquipment } from "@/lib/types";

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
  { icon: "🥗", title: "Personalized diet", desc: "Macro targets & meal plans tailored to your goal" },
  { icon: "🏋️", title: "Smart workouts", desc: "Plans that match your equipment & schedule" },
  { icon: "📸", title: "Voice & photo logging", desc: "Log meals by speaking or snapping your plate" },
  { icon: "⌚", title: "Wearable sync", desc: "Oura, Fitbit, Apple Health & more" },
  { icon: "🧩", title: "AI coach Reco", desc: "Guidance, tips & weekly reviews" },
];

export function LandingPage({
  onSubmit,
  loading,
}: {
  onSubmit: (d: Partial<UserProfile>) => void;
  loading: boolean;
}) {
  const poundsToKg = (lbs: number): number => lbs * 0.45359237;
  const feetInchesToCm = (feet: number, inches: number): number => (feet * 12 + inches) * 2.54;

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [heightFeet, setHeightFeet] = useState("");
  const [heightInches, setHeightInches] = useState("");
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lbs = parseFloat(weightLbs);
    const feet = parseInt(heightFeet, 10);
    const inches = parseInt(heightInches, 10);
    const totalInches =
      Number.isFinite(feet) && feet > 0 ? feet * 12 + (Number.isFinite(inches) && inches >= 0 ? inches : 0) : 0;
    onSubmit({
      name: name || "User",
      age: parseInt(age) || 30,
      weight: Number.isFinite(lbs) && lbs > 0 ? poundsToKg(lbs) : 70,
      height: totalInches > 0 ? feetInchesToCm(feet, Number.isFinite(inches) ? inches : 0) : 170,
      gender,
      fitnessLevel,
      goal,
      dailyActivityLevel: activity,
      workoutLocation,
      workoutEquipment,
      workoutDaysPerWeek,
      workoutTimeframe,
      dietaryRestrictions: restrictions.split(",").map((s) => s.trim()).filter(Boolean),
    });
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--accent)]/[0.03] via-transparent to-[var(--accent-terracotta)]/[0.04]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full bg-[var(--accent)]/[0.06] blur-3xl" />
      </div>

      <header className="border-b border-[var(--border-soft)] bg-[var(--background)]/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="mx-auto max-w-4xl px-5 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-xl">🧩</span>
            <span className="brand-title !text-lg text-[var(--accent)] leading-none">Recomp</span>
          </div>
          <span className="text-xs text-[var(--muted)] hidden sm:inline">Powered by Amazon Nova</span>
        </div>
      </header>

      <section className="px-5 pt-16 pb-12 sm:pt-20 sm:pb-16 text-center">
        <h1
          className="brand-title text-[var(--foreground)] font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl tracking-tight leading-[1.05] max-w-4xl mx-auto animate-fade-in"
          style={{ animationDelay: "0ms" }}
        >
          Your AI-powered{" "}
          <span className="text-[var(--accent)] block sm:inline sm:ml-2">body recomposition</span>
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
                className="rounded-xl border border-[var(--border-soft)] bg-[var(--card-bg)]/80 backdrop-blur-sm p-4 shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-medium)] transition-shadow animate-fade-in"
                style={{ animationDelay: `${120 + i * 50}ms` }}
              >
                <span className="text-2xl" aria-hidden>
                  {f.icon}
                </span>
                <h3 className="mt-2 font-medium text-[var(--foreground)] text-sm">{f.title}</h3>
                <p className="mt-1 text-[var(--muted)] text-xs leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-20">
        <div className="mx-auto max-w-lg">
          <div className="text-center mb-6 animate-fade-in" style={{ animationDelay: "350ms" }}>
            <h2 className="brand-title text-2xl sm:text-3xl md:text-4xl font-bold text-[var(--foreground)] tracking-tight">
              Create your personalized plan
            </h2>
            <p className="mt-2 text-[var(--muted)] text-sm uppercase tracking-widest font-medium">
              A few quick questions to get started
            </p>
          </div>
          <div className="card p-6 sm:p-8 animate-fade-in" style={{ animationDelay: "400ms" }}>
            <form onSubmit={handleSubmit} className="space-y-5">
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
              <div className="grid grid-cols-4 gap-3">
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
              <button type="submit" disabled={loading} className="btn-primary w-full !py-3 !text-sm">
                {loading ? "Generating your plan with Amazon Nova..." : "Create my plan"}
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
