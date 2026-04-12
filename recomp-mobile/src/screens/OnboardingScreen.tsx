import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { v4 as uuidv4 } from "uuid";
import { Button, Card, Input } from "../components/ui";
import { colors, fontSize, fontWeight, spacing } from "../theme";
import type { UserProfile, FitnessPlan, WorkoutLocation, WorkoutEquipment } from "../lib/types";
import { useAuthStore } from "../store/authStore";
import { useAppStore } from "../store/appStore";
import { apiJson } from "../lib/api";
import { syncToServer } from "../lib/sync";

const poundsToKg = (lbs: number) => lbs * 0.45359237;
const feetInchesToCm = (feet: number, inches: number) =>
  (feet * 12 + inches) * 2.54;

const schema = z.object({
  name: z.string().min(1, "Name required").max(80),
  age: z.coerce.number().int().min(10).max(120),
  weightLbs: z.coerce.number().min(50).max(1000),
  heightFeet: z.coerce.number().int().min(3).max(8),
  heightInches: z.coerce.number().int().min(0).max(11),
  gender: z.enum(["male", "female", "other"]),
  fitnessLevel: z.enum(["beginner", "intermediate", "advanced", "athlete"]),
  goal: z.enum(["lose_weight", "maintain", "build_muscle", "improve_endurance"]),
  dailyActivityLevel: z.enum([
    "sedentary",
    "light",
    "moderate",
    "active",
    "very_active",
  ]),
  workoutLocation: z.enum(["home", "gym", "outside"]),
  workoutDaysPerWeek: z.coerce.number().int().min(2).max(7),
  workoutTimeframe: z.enum(["morning", "afternoon", "evening", "flexible"]),
  restrictions: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const FITNESS_LEVELS: { value: FormData["fitnessLevel"]; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "athlete", label: "Athlete" },
];

const GOALS: { value: FormData["goal"]; label: string }[] = [
  { value: "lose_weight", label: "Lose weight" },
  { value: "maintain", label: "Maintain" },
  { value: "build_muscle", label: "Build muscle" },
  { value: "improve_endurance", label: "Improve endurance" },
];

const ACTIVITIES: { value: FormData["dailyActivityLevel"]; label: string }[] = [
  { value: "sedentary", label: "Sedentary" },
  { value: "light", label: "Light" },
  { value: "moderate", label: "Moderate" },
  { value: "active", label: "Active" },
  { value: "very_active", label: "Very active" },
];

const LOCATIONS: { value: WorkoutLocation; label: string }[] = [
  { value: "home", label: "Home" },
  { value: "gym", label: "Gym" },
  { value: "outside", label: "Outside" },
];

const EQUIPMENT: { value: WorkoutEquipment; label: string }[] = [
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

function OptionRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.optionsRow}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          onPress={() => onChange(opt.value)}
          style={[
            styles.optionChip,
            value === opt.value && styles.optionChipActive,
          ]}
        >
          <Text
            style={[
              styles.optionText,
              value === opt.value && styles.optionTextActive,
            ]}
          >
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function OptionChipsMulti<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
}) {
  const toggle = (v: T) => {
    onChange(
      value.includes(v) ? value.filter((x) => x !== v) : [...value, v]
    );
  };
  return (
    <View style={styles.optionsWrap}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          onPress={() => toggle(opt.value)}
          style={[
            styles.optionChip,
            value.includes(opt.value) && styles.optionChipActive,
          ]}
        >
          <Text
            style={[
              styles.optionText,
              value.includes(opt.value) && styles.optionTextActive,
            ]}
          >
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

interface OnboardingScreenProps {
  onComplete: () => void;
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [loading, setLoading] = useState(false);
  const [equipment, setEquipment] = useState<WorkoutEquipment[]>([
    "free_weights",
    "machines",
  ]);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceExtracting, setVoiceExtracting] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState<boolean | null>(null);
  const voiceActiveRef = useRef(false);
  const { setUserId, setProfile, setDemoMode } = useAuthStore();
  const { setPlan } = useAppStore();

  useEffect(() => {
    if (voiceAvailable === null) {
      ExpoSpeechRecognitionModule.isRecognitionAvailable().then(setVoiceAvailable);
    }
  }, [voiceAvailable]);

  useSpeechRecognitionEvent("result", async (event) => {
    if (!voiceActiveRef.current || !event.isFinal) return;
    const t = event.results?.[0]?.transcript?.trim();
    if (!t) return;
    voiceActiveRef.current = false;
    setVoiceListening(false);
    setVoiceExtracting(true);
    try {
      const d = await apiJson<{
        name?: string | null;
        age?: number | null;
        weightLbs?: number | null;
        heightFt?: number | null;
        heightIn?: number | null;
        gender?: FormData["gender"] | null;
        fitnessLevel?: FormData["fitnessLevel"] | null;
        goal?: FormData["goal"] | null;
        dailyActivityLevel?: FormData["dailyActivityLevel"] | null;
        workoutLocation?: FormData["workoutLocation"] | null;
        restrictions?: string | null;
      }>("/api/onboarding/voice-extract", {
        method: "POST",
        body: JSON.stringify({ transcript: t }),
      });
      if (d.name) setValue("name", d.name);
      if (d.age != null) setValue("age", d.age);
      if (d.weightLbs != null) setValue("weightLbs", d.weightLbs);
      if (d.heightFt != null) setValue("heightFeet", d.heightFt);
      if (d.heightIn != null) setValue("heightInches", d.heightIn);
      if (d.gender) setValue("gender", d.gender);
      if (d.fitnessLevel) setValue("fitnessLevel", d.fitnessLevel);
      if (d.goal) setValue("goal", d.goal);
      if (d.dailyActivityLevel) setValue("dailyActivityLevel", d.dailyActivityLevel);
      if (d.workoutLocation) setValue("workoutLocation", d.workoutLocation);
      if (d.restrictions) setValue("restrictions", d.restrictions);
      setVoiceMode(false);
    } catch {
      Alert.alert("Voice parse failed", "Could not extract your info. Please use the form.");
    } finally {
      setVoiceExtracting(false);
    }
  });

  useSpeechRecognitionEvent("error", () => {
    if (voiceActiveRef.current) {
      voiceActiveRef.current = false;
      setVoiceListening(false);
      setVoiceExtracting(false);
    }
  });

  useSpeechRecognitionEvent("end", () => setVoiceListening(false));

  const handleVoiceStart = async () => {
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!result.granted) {
      Alert.alert("Permission needed", "Allow microphone and speech recognition for voice setup.");
      return;
    }
    voiceActiveRef.current = true;
    setVoiceListening(true);
    try {
      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: false,
        continuous: false,
      });
    } catch {
      voiceActiveRef.current = false;
      setVoiceListening(false);
    }
  };

  const handleVoiceStop = () => {
    ExpoSpeechRecognitionModule.stop();
    voiceActiveRef.current = false;
    setVoiceListening(false);
  };

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      age: 30,
      weightLbs: 154,
      heightFeet: 5,
      heightInches: 7,
      gender: "other",
      fitnessLevel: "intermediate",
      goal: "maintain",
      dailyActivityLevel: "moderate",
      workoutLocation: "gym",
      workoutDaysPerWeek: 4,
      workoutTimeframe: "flexible",
      restrictions: "",
    },
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const profile: UserProfile = {
        id: uuidv4(),
        name: data.name || "User",
        age: data.age,
        weight: poundsToKg(data.weightLbs),
        height: feetInchesToCm(data.heightFeet, data.heightInches),
        gender: data.gender,
        fitnessLevel: data.fitnessLevel,
        goal: data.goal,
        dietaryRestrictions: data.restrictions
          ? data.restrictions.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        injuriesOrLimitations: [],
        dailyActivityLevel: data.dailyActivityLevel,
        workoutLocation: data.workoutLocation,
        workoutEquipment: equipment,
        workoutDaysPerWeek: data.workoutDaysPerWeek,
        workoutTimeframe: data.workoutTimeframe,
        createdAt: new Date().toISOString(),
      };

      const res = await apiJson<{
        ok: boolean;
        userId: string;
        profile: UserProfile;
        profileSaved: boolean;
      }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(profile),
      });

      if (res.ok && res.userId) {
        await setUserId(res.userId);
        await setProfile(res.profile);
        setDemoMode(res.profileSaved === false);
        const planRes = await apiJson<FitnessPlan | { error: string }>("/api/plans/generate", {
          method: "POST",
          body: JSON.stringify(res.profile),
        });
        if (planRes && !("error" in planRes)) {
          await setPlan(planRes);
        }
        await syncToServer();
        setLoading(false);
        onComplete();
      } else {
        throw new Error("Registration failed");
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  return (
    <>
    <Modal visible={loading} transparent>
      <View style={styles.loadingOverlay}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingTitle}>Creating your plan</Text>
          <Text style={styles.loadingSub}>
            Amazon Nova is generating your personalized diet and workout plan. This may take 30–60 seconds…
          </Text>
        </View>
      </View>
    </Modal>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.emoji}>🧩</Text>
          <Text style={styles.title}>Recomp</Text>
          <Text style={styles.subtitle}>Create your personalized plan</Text>
        </View>

        {voiceAvailable !== false && (
          <TouchableOpacity
            style={styles.voiceToggle}
            onPress={() => setVoiceMode((v) => !v)}
            disabled={voiceExtracting}
          >
            <Text style={styles.voiceToggleText}>
              {voiceMode ? "Hide voice setup" : "Or use voice to describe yourself"}
            </Text>
          </TouchableOpacity>
        )}

        {voiceMode && voiceAvailable && (
          <View style={styles.voiceBox}>
            <Text style={styles.voiceHint}>
              {voiceListening
                ? "Speak now…"
                : voiceExtracting
                  ? "Extracting…"
                  : "Describe yourself: name, age, weight, height, goal, etc."}
            </Text>
            <TouchableOpacity
              style={[styles.voiceBtn, voiceListening && styles.voiceBtnActive]}
              onPress={voiceListening ? handleVoiceStop : handleVoiceStart}
              disabled={voiceExtracting}
            >
              <Text style={styles.voiceBtnIcon}>{voiceListening ? "⏹" : "🎤"}</Text>
            </TouchableOpacity>
          </View>
        )}

        <Card style={styles.card}>
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Name"
                placeholder="Your name"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.name?.message}
              />
            )}
          />

          <View style={styles.row}>
            <View style={styles.half}>
              <Controller
                control={control}
                name="age"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Age"
                    placeholder="30"
                    value={value ? String(value) : ""}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    keyboardType="number-pad"
                    error={errors.age?.message}
                  />
                )}
              />
            </View>
            <View style={styles.half}>
              <Controller
                control={control}
                name="weightLbs"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Weight (lbs)"
                    placeholder="154"
                    value={value ? String(value) : ""}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    keyboardType="decimal-pad"
                    error={errors.weightLbs?.message}
                  />
                )}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.half}>
              <Controller
                control={control}
                name="heightFeet"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Height (ft)"
                    placeholder="5"
                    value={value ? String(value) : ""}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    keyboardType="number-pad"
                    error={errors.heightFeet?.message}
                  />
                )}
              />
            </View>
            <View style={styles.half}>
              <Controller
                control={control}
                name="heightInches"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Height (in)"
                    placeholder="7"
                    value={value ? String(value) : ""}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    keyboardType="number-pad"
                    error={errors.heightInches?.message}
                  />
                )}
              />
            </View>
          </View>

          <Text style={styles.sectionLabel}>Fitness level</Text>
          <Controller
            control={control}
            name="fitnessLevel"
            render={({ field: { value, onChange } }) => (
              <OptionRow
                options={FITNESS_LEVELS}
                value={value}
                onChange={onChange}
              />
            )}
          />

          <Text style={styles.sectionLabel}>Goal</Text>
          <Controller
            control={control}
            name="goal"
            render={({ field: { value, onChange } }) => (
              <OptionRow options={GOALS} value={value} onChange={onChange} />
            )}
          />

          <Text style={styles.sectionLabel}>Activity level</Text>
          <Controller
            control={control}
            name="dailyActivityLevel"
            render={({ field: { value, onChange } }) => (
              <OptionRow
                options={ACTIVITIES}
                value={value}
                onChange={onChange}
              />
            )}
          />

          <Text style={styles.sectionLabel}>Workout location</Text>
          <Controller
            control={control}
            name="workoutLocation"
            render={({ field: { value, onChange } }) => (
              <OptionRow
                options={LOCATIONS}
                value={value}
                onChange={onChange}
              />
            )}
          />

          <Text style={styles.sectionLabel}>Equipment available</Text>
          <OptionChipsMulti
            options={EQUIPMENT}
            value={equipment}
            onChange={setEquipment}
          />

          <Controller
            control={control}
            name="workoutDaysPerWeek"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Workout days per week (2–7)"
                placeholder="4"
                value={value ? String(value) : ""}
                onChangeText={onChange}
                onBlur={onBlur}
                keyboardType="number-pad"
                error={errors.workoutDaysPerWeek?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="restrictions"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Dietary restrictions (comma-separated)"
                placeholder="e.g. dairy-free, gluten-free"
                value={value || ""}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />

          <Button
            title={loading ? "Creating plan…" : "Create my plan"}
            onPress={handleSubmit(onSubmit)}
            loading={loading}
            style={styles.submitBtn}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing[5],
    paddingBottom: spacing[16],
  },
  header: {
    alignItems: "center",
    paddingVertical: spacing[8],
  },
  emoji: {
    fontSize: 40,
    marginBottom: spacing[2],
  },
  title: {
    fontSize: fontSize.h2,
    fontWeight: fontWeight.bold,
    color: colors.accent,
    letterSpacing: 0.06,
  },
  subtitle: {
    fontSize: fontSize.body,
    color: colors.mutedForeground,
    marginTop: spacing[2],
  },
  voiceToggle: {
    marginTop: spacing[2],
    paddingVertical: spacing[3],
    alignItems: "center",
  },
  voiceToggleText: {
    fontSize: fontSize.small,
    color: colors.accent,
    fontWeight: fontWeight.medium,
  },
  voiceBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    marginTop: spacing[2],
    padding: spacing[4],
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
  },
  voiceHint: {
    flex: 1,
    fontSize: fontSize.small,
    color: colors.mutedForeground,
  },
  voiceBtn: {
    padding: spacing[3],
    backgroundColor: colors.background,
    borderRadius: 12,
  },
  voiceBtnActive: {
    backgroundColor: colors.accent10,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  voiceBtnIcon: {
    fontSize: 24,
  },
  card: {
    marginTop: spacing[4],
  },
  row: {
    flexDirection: "row",
    gap: spacing[3],
  },
  half: {
    flex: 1,
  },
  sectionLabel: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.medium,
    color: colors.mutedForeground,
    marginBottom: spacing[2],
    marginTop: spacing[2],
  },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  optionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
    marginBottom: spacing[4],
  },
  optionChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  optionChipActive: {
    backgroundColor: colors.accent10,
    borderColor: colors.accent,
  },
  optionText: {
    fontSize: fontSize.small,
    color: colors.mutedForeground,
  },
  optionTextActive: {
    color: colors.accent,
    fontWeight: fontWeight.semibold,
  },
  submitBtn: {
    marginTop: spacing[6],
  },
  loadingOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing[5],
  },
  loadingCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: spacing[8],
    alignItems: "center",
    maxWidth: 320,
  },
  loadingTitle: {
    fontSize: fontSize.h5,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginTop: spacing[4],
  },
  loadingSub: {
    fontSize: fontSize.small,
    color: colors.muted,
    marginTop: spacing[2],
    textAlign: "center",
  },
});
