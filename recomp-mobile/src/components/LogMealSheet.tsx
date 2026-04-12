import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useAppStore } from "../store/appStore";
import { useAuthStore } from "../store/authStore";
import { Button, Input } from "./ui";
import { apiJson, apiFormData } from "../lib/api";
import { colors, fontSize, fontWeight, spacing, radius, lineHeight } from "../theme";
import { syncToServer } from "../lib/sync";
import { hapticSuccess, hapticError } from "../lib/haptics";
import { v4 as uuidv4 } from "uuid";
import type { MealEntry, Macros } from "../lib/types";

type Tab = "text" | "voice" | "photo" | "receipt";

interface LogMealSheetProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: string;
  targets: Macros;
}

export function LogMealSheet({
  visible,
  onClose,
  selectedDate,
  targets,
}: LogMealSheetProps) {
  const [tab, setTab] = useState<Tab>("text");
  const [name, setName] = useState("");
  const [mealType, setMealType] = useState<MealEntry["mealType"]>("lunch");
  const [cal, setCal] = useState("");
  const [pro, setPro] = useState("");
  const [carb, setCarb] = useState("");
  const [fat, setFat] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState<boolean | null>(null);
  const voiceActiveRef = useRef(false);

  const { addMeal } = useAppStore();
  const { profile } = useAuthStore();

  useEffect(() => {
    if (tab === "voice" && voiceAvailable === null) {
      ExpoSpeechRecognitionModule.isRecognitionAvailable().then(setVoiceAvailable);
    }
  }, [tab, voiceAvailable]);

  useSpeechRecognitionEvent("result", async (event) => {
    if (!voiceActiveRef.current || !event.isFinal) return;
    const t = event.results?.[0]?.transcript;
    if (!t?.trim()) return;
    voiceActiveRef.current = false;
    setVoiceListening(false);
    setVoiceLoading(true);
    try {
      const d = await apiJson<{ name?: string; calories?: number; protein?: number; carbs?: number; fat?: number }>(
        "/api/voice/parse",
        { method: "POST", body: JSON.stringify({ transcript: t }) }
      );
      setName(d.name ?? t);
      setCal(String(d.calories ?? ""));
      setPro(String(d.protein ?? ""));
      setCarb(String(d.carbs ?? ""));
      setFat(String(d.fat ?? ""));
      setTab("text");
    } catch {
      setName(t);
      setTab("text");
    } finally {
      setVoiceLoading(false);
    }
  });

  useSpeechRecognitionEvent("error", () => {
    if (voiceActiveRef.current) {
      voiceActiveRef.current = false;
      setVoiceListening(false);
      setVoiceLoading(false);
      hapticError();
    }
  });

  useSpeechRecognitionEvent("end", () => {
    setVoiceListening(false);
  });

  const handleVoiceLog = async () => {
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!result.granted) {
      Alert.alert("Permission needed", "Allow microphone and speech recognition to log meals by voice.");
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
      hapticError();
    }
  };

  const handleVoiceStop = () => {
    ExpoSpeechRecognitionModule.stop();
    voiceActiveRef.current = false;
    setVoiceListening(false);
  };

  const reset = () => {
    setName("");
    setCal("");
    setPro("");
    setCarb("");
    setFat("");
  };

  const handleSuggest = async () => {
    setSuggestLoading(true);
    try {
      const res = await apiJson<{ suggestions?: { name: string; calories?: number; protein?: number; carbs?: number; fat?: number }[] }>(
        "/api/meals/suggest",
        {
          method: "POST",
          body: JSON.stringify({
            mealType,
            remainingCalories: 500,
            remainingProtein: 30,
            restrictions: profile?.dietaryRestrictions ?? [],
            recipes: [],
          }),
        }
      );
      const s = res.suggestions?.[0];
      if (s) {
        setName(s.name ?? "");
        setCal(String(s.calories ?? ""));
        setPro(String(s.protein ?? ""));
        setCarb(String(s.carbs ?? ""));
        setFat(String(s.fat ?? ""));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSuggestLoading(false);
    }
  };

  const submitMeal = (macros: Macros) => {
    const meal: MealEntry = {
      id: uuidv4(),
      date: selectedDate,
      mealType,
      name: name || "Meal",
      macros,
      loggedAt: new Date().toISOString(),
    };
    addMeal(meal);
    syncToServer();
    hapticSuccess();
    reset();
    onClose();
  };

  const handleTextSubmit = () => {
    const macros: Macros = {
      calories: parseInt(cal, 10) || 0,
      protein: parseInt(pro, 10) || 0,
      carbs: parseInt(carb, 10) || 0,
      fat: parseInt(fat, 10) || 0,
    };
    if (!name.trim()) {
      hapticError();
      Alert.alert("Error", "Enter a meal name");
      return;
    }
    submitMeal(macros);
  };

  const handlePhotoLog = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo access to log meals from camera roll.");
      return;
    }
    setLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) {
        setLoading(false);
        return;
      }
      const uri = result.assets[0].uri;
      const formData = new FormData();
      formData.append("image", {
        uri,
        type: "image/jpeg",
        name: "photo.jpg",
      } as unknown as Blob);

      const res = await apiFormData("/api/meals/analyze-photo", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.name) {
        setName(data.name);
        setCal(String(data.calories ?? 0));
        setPro(String(data.protein ?? 0));
        setCarb(String(data.carbs ?? 0));
        setFat(String(data.fat ?? 0));
        setTab("text");
      } else {
        hapticError();
        Alert.alert("Analysis failed", "Could not analyze the photo. Try text input.");
      }
    } catch (e) {
      console.error(e);
      hapticError();
      Alert.alert("Error", "Photo analysis failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReceiptLog = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo access to scan receipts.");
      return;
    }
    setLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) {
        setLoading(false);
        return;
      }
      const uri = result.assets[0].uri;
      const formData = new FormData();
      formData.append("image", {
        uri,
        type: "image/jpeg",
        name: "receipt.jpg",
      } as unknown as Blob);

      const res = await apiFormData("/api/meals/analyze-receipt", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.items?.length > 0) {
        const first = data.items[0];
        setName(first.name || "Receipt items");
        setCal(String(first.calories ?? 0));
        setPro(String(first.protein ?? 0));
        setCarb(String(first.carbs ?? 0));
        setFat(String(first.fat ?? 0));
        setTab("text");
      } else {
        hapticError();
        Alert.alert("No items found", "Could not extract items from receipt. Try text input.");
      }
    } catch (e) {
      console.error(e);
      hapticError();
      Alert.alert("Error", "Receipt scan failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "text", label: "Text" },
    { key: "voice", label: "Voice" },
    { key: "photo", label: "Photo" },
    { key: "receipt", label: "Receipt" },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.dragHandleWrap}>
            <View style={styles.dragHandle} />
          </View>
          <View style={styles.header}>
            <Text style={styles.title}>Log meal</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close meal logging"
            >
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.tabs} accessibilityRole="tablist">
            {tabs.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, tab === t.key && styles.tabActive]}
                onPress={() => setTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t.key }}
                accessibilityLabel={`${t.label} input method`}
              >
                <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === "text" && (
            <ScrollView style={styles.content}>
              <Input label="Meal name" placeholder="e.g. Grilled chicken salad" value={name} onChangeText={setName} />
              <View style={styles.mealTypeRow}>
                {(["breakfast", "lunch", "dinner", "snack"] as const).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.mealTypeBtn, mealType === t && styles.mealTypeBtnActive]}
                    onPress={() => setMealType(t)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: mealType === t }}
                    accessibilityLabel={`${t} meal type`}
                  >
                    <Text style={[styles.mealTypeText, mealType === t && styles.mealTypeTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.macrosRow}>
                <Input label="Cal" value={cal} onChangeText={setCal} keyboardType="number-pad" containerStyle={styles.macroInput} />
                <Input label="Protein" value={pro} onChangeText={setPro} keyboardType="number-pad" containerStyle={styles.macroInput} />
                <Input label="Carbs" value={carb} onChangeText={setCarb} keyboardType="number-pad" containerStyle={styles.macroInput} />
                <Input label="Fat" value={fat} onChangeText={setFat} keyboardType="number-pad" containerStyle={styles.macroInput} />
              </View>
              <Button title={suggestLoading ? "…" : "Suggest"} onPress={handleSuggest} variant="secondary" disabled={suggestLoading} style={styles.suggestBtn} />
              <Button title="Add meal" onPress={handleTextSubmit} loading={loading} />
            </ScrollView>
          )}

          {tab === "voice" && (
            <View style={styles.content}>
              {voiceAvailable === false ? (
                <>
                  <Text style={styles.placeholderText}>Voice recognition is not available on this device.</Text>
                  <Text style={styles.placeholderSub}>Use Text or Photo to log meals.</Text>
                </>
              ) : (
                <>
                  <Text style={styles.placeholderText}>
                    {voiceListening ? "Speak your meal…" : "Tap below and describe what you ate. AI will parse it into macros."}
                  </Text>
                  <Button
                    title={voiceListening ? "Stop" : voiceLoading ? "Parsing…" : "Speak your meal"}
                    onPress={voiceListening ? handleVoiceStop : handleVoiceLog}
                    loading={voiceLoading}
                    disabled={voiceAvailable === null}
                    style={styles.voiceBtn}
                  />
                </>
              )}
            </View>
          )}

          {tab === "photo" && (
            <View style={styles.content}>
              <Button title={loading ? "Analyzing…" : "Choose photo"} onPress={handlePhotoLog} loading={loading} />
              <Text style={styles.placeholderSub}>Snap your plate or choose from library. AI will estimate macros.</Text>
            </View>
          )}

          {tab === "receipt" && (
            <View style={styles.content}>
              <Button title={loading ? "Scanning…" : "Choose receipt photo"} onPress={handleReceiptLog} loading={loading} />
              <Text style={styles.placeholderSub}>Photo a grocery receipt. AI will extract food items with nutrition.</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: "85%",
    paddingBottom: spacing[16],
  },
  dragHandleWrap: {
    alignItems: "center",
    paddingTop: spacing[2],
    paddingBottom: spacing[1],
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceElevated,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing[5],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  title: {
    fontSize: fontSize.h4,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
  },
  close: {
    fontSize: 24,
    color: colors.muted,
  },
  tabs: {
    flexDirection: "row",
    padding: spacing[2],
    gap: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing[3],
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
  },
  tabActive: {
    backgroundColor: colors.accent10,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  tabText: {
    fontSize: fontSize.small,
    color: colors.mutedForeground,
  },
  tabTextActive: {
    color: colors.accent,
    fontWeight: fontWeight.semibold,
  },
  content: {
    padding: spacing[5],
  },
  mealTypeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
    marginBottom: spacing[4],
  },
  mealTypeBtn: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
  },
  mealTypeBtnActive: {
    backgroundColor: colors.accent10,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  mealTypeText: {
    fontSize: fontSize.small,
    color: colors.mutedForeground,
  },
  mealTypeTextActive: {
    color: colors.accent,
    fontWeight: fontWeight.semibold,
  },
  macrosRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[3],
  },
  macroInput: {
    flex: 1,
    minWidth: 70,
    marginBottom: 0,
  },
  suggestBtn: {
    marginBottom: spacing[4],
  },
  voiceBtn: {
    marginTop: spacing[2],
  },
  placeholderText: {
    fontSize: fontSize.body,
    color: colors.foreground,
    marginBottom: spacing[2],
  },
  placeholderSub: {
    fontSize: fontSize.small,
    color: colors.muted,
  },
});
