import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { apiJson } from "../lib/api";
import { getRicoHistory, saveRicoHistory } from "../lib/storage";
import { useAppStore } from "../store/appStore";
import { useAuthStore } from "../store/authStore";
import type { RicoMessage } from "../lib/types";
import { hapticSuccess, hapticError } from "../lib/haptics";
import { colors, fontSize, fontWeight, spacing, radius, lineHeight } from "../theme";

interface RicoChatModalProps {
  visible: boolean;
  onClose: () => void;
}

export function RicoChatModal({ visible, onClose }: RicoChatModalProps) {
  const [messages, setMessages] = useState<RicoMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState<boolean | null>(null);
  const voiceActiveRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const { plan, meals, selectedDate } = useAppStore();
  const { profile } = useAuthStore();

  useEffect(() => {
    if (visible) {
      getRicoHistory().then(setMessages);
      if (voiceAvailable === null) {
        ExpoSpeechRecognitionModule.isRecognitionAvailable().then(setVoiceAvailable);
      }
    }
  }, [visible, voiceAvailable]);

  useSpeechRecognitionEvent("result", async (event) => {
    if (!voiceActiveRef.current || !event.isFinal) return;
    const t = event.results?.[0]?.transcript?.trim();
    if (!t) return;
    voiceActiveRef.current = false;
    setVoiceListening(false);
    setInput((prev) => (prev ? `${prev} ${t}` : t));
  });

  useSpeechRecognitionEvent("error", () => {
    if (voiceActiveRef.current) {
      voiceActiveRef.current = false;
      setVoiceListening(false);
      hapticError();
    }
  });

  useSpeechRecognitionEvent("end", () => setVoiceListening(false));

  useEffect(() => {
    if (messages.length > 0) saveRicoHistory(messages);
  }, [messages]);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [messages, scrollToEnd]);

  const handleVoiceToggle = async () => {
    if (voiceListening) {
      ExpoSpeechRecognitionModule.stop();
      voiceActiveRef.current = false;
      setVoiceListening(false);
      return;
    }
    if (voiceAvailable === false) return;
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!result.granted) {
      Alert.alert("Permission needed", "Allow microphone and speech recognition for voice input.");
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

  const buildContext = () => {
    const today = new Date().toISOString().slice(0, 10);
    const todaysMeals = meals.filter((m) => m.date === today);
    const recentCount = meals.filter((m) => {
      const d = new Date(m.date).getTime();
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return d >= weekAgo;
    }).length;
    return {
      userName: profile?.name ?? "there",
      goal: plan?.dietPlan?.dailyTargets ? `${plan.dietPlan.dailyTargets.calories} cal target` : undefined,
      mealsLoggedToday: todaysMeals.length,
      mealsLoggedThisWeek: recentCount,
    };
  };

  const send = async () => {
    const msg = input.trim();
    if (!msg || loading) return;

    setInput("");
    const userMsg: RicoMessage = {
      role: "user",
      content: msg,
      at: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);

    try {
      const res = await apiJson<{ reply?: string; error?: string }>("/api/rico", {
        method: "POST",
        body: JSON.stringify({ message: msg, context: buildContext() }),
      });
      const reply = res.reply ?? res.error ?? "Something went wrong. Try again.";
      const assistantMsg: RicoMessage = {
        role: "assistant",
        content: reply,
        at: new Date().toISOString(),
      };
      setMessages((m) => [...m, assistantMsg]);
      hapticSuccess();
    } catch (e) {
      console.error(e);
      const errMsg: RicoMessage = {
        role: "assistant",
        content: "Reco is taking a breather. Try again in a moment.",
        at: new Date().toISOString(),
      };
      setMessages((m) => [...m, errMsg]);
      hapticError();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.sheet}>
          <View style={styles.dragHandleWrap}>
            <View style={styles.dragHandle} />
          </View>
          <View style={styles.header}>
            <Text style={styles.title}>Reco</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.messages}
            contentContainerStyle={styles.messagesContent}
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 && !loading && (
              <Text style={styles.placeholder}>Hi{profile?.name ? ` ${profile.name}` : ""}! Ask me anything about your diet, workouts, or motivation.</Text>
            )}
            {messages.map((m, i) => (
              <View
                key={`${m.at}-${i}`}
                style={[styles.bubble, m.role === "user" ? styles.bubbleUser : styles.bubbleAssistant]}
              >
                <Text style={[styles.bubbleText, m.role === "user" ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
                  {m.content}
                </Text>
              </View>
            ))}
            {loading && (
              <View style={[styles.bubble, styles.bubbleAssistant]}>
                <ActivityIndicator size="small" color={colors.accent} />
              </View>
            )}
          </ScrollView>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder={voiceListening ? "Listening…" : "Ask Reco…"}
              placeholderTextColor={colors.muted}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={send}
              returnKeyType="send"
              editable={!loading && !voiceListening}
              multiline
              maxLength={500}
            />
            {voiceAvailable && (
              <TouchableOpacity
                style={[styles.micBtn, voiceListening && styles.micBtnActive]}
                onPress={handleVoiceToggle}
                disabled={loading}
                accessibilityLabel={voiceListening ? "Stop voice input" : "Start voice input"}
              >
                <Text style={styles.micIcon}>{voiceListening ? "⏹" : "🎤"}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
              onPress={send}
              disabled={!input.trim() || loading}
            >
              <Text style={styles.sendLabel}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    maxHeight: "90%",
    minHeight: 300,
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
  messages: {
    flex: 1,
    maxHeight: 400,
  },
  messagesContent: {
    padding: spacing[5],
    paddingBottom: spacing[4],
  },
  placeholder: {
    fontSize: fontSize.body,
    color: colors.muted,
    textAlign: "center",
    marginVertical: spacing[6],
  },
  bubble: {
    maxWidth: "85%",
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: radius.lg,
    marginBottom: spacing[2],
  },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: colors.accent,
  },
  bubbleAssistant: {
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceElevated,
  },
  bubbleText: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
  },
  bubbleTextUser: {
    color: "#fff",
  },
  bubbleTextAssistant: {
    color: colors.foreground,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.background,
    paddingBottom: spacing[6],
  },
  input: {
    flex: 1,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    fontSize: fontSize.body,
    color: colors.foreground,
    maxHeight: 100,
  },
  micBtn: {
    marginLeft: spacing[2],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    justifyContent: "center",
  },
  micBtnActive: {
    backgroundColor: colors.accent10,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  micIcon: {
    fontSize: 20,
  },
  sendBtn: {
    marginLeft: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendLabel: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
    color: "#fff",
  },
});
