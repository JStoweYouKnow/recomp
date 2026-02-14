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

export function ProfileView({
  profile,
  onProfileUpdate,
}: {
  profile: UserProfile;
  onProfileUpdate: (p: UserProfile) => void;
}) {
  const { ft, inch } = cmToFeetInches(profile.height);
  const [name, setName] = useState(profile.name);
  const [age, setAge] = useState(String(profile.age));
  const [weightLbs, setWeightLbs] = useState(String(Math.round(kgToLbs(profile.weight))));
  const [heightFeet, setHeightFeet] = useState(String(ft || 5));
  const [heightInches, setHeightInches] = useState(String(inch || 7));
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

  const handleSave = () => {
    const lbs = parseFloat(weightLbs);
    const feet = parseInt(heightFeet, 10);
    const inches = parseInt(heightInches, 10);
    const totalInches =
      Number.isFinite(feet) && feet > 0 ? feet * 12 + (Number.isFinite(inches) && inches >= 0 ? inches : 0) : 0;
    onProfileUpdate({
      ...profile,
      name: name.trim() || profile.name,
      age: parseInt(age, 10) || profile.age,
      weight: Number.isFinite(lbs) && lbs > 0 ? poundsToKg(lbs) : profile.weight,
      height: totalInches > 0 ? feetInchesToCm(feet, Number.isFinite(inches) ? inches : 0) : profile.height,
      gender,
      fitnessLevel,
      goal,
      dailyActivityLevel: activity,
      workoutLocation,
      workoutEquipment,
      workoutDaysPerWeek,
      workoutTimeframe,
      dietaryRestrictions: restrictions.split(",").map((s) => s.trim()).filter(Boolean),
      injuriesOrLimitations: injuries.split(",").map((s) => s.trim()).filter(Boolean),
    });
  };

  return (
    <div className="animate-fade-in">
      <h2 className="section-title !text-xl mb-6">Profile</h2>
      <div className="card p-6">
        <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-5" noValidate>
          <div>
            <label className="label">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-base w-full" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="label">Age</label>
              <input type="number" value={age} onChange={(e) => setAge(e.target.value)} min={10} max={120} className="input-base w-full" />
            </div>
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
    </div>
  );
}
