import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Linking,
} from "react-native";
import { apiJson, apiFetch } from "../lib/api";
import { saveWearableData } from "../lib/storage";
import { Card, Button } from "../components/ui";
import { colors, fontSize, fontWeight, spacing } from "../theme";
import { API_BASE_URL } from "../lib/config";
import type { WearableDaySummary } from "../lib/types";

export function WearablesScreen() {
  const [ouraToken, setOuraToken] = useState("");
  const [importJson, setImportJson] = useState("");
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const connectOura = async () => {
    if (!ouraToken.trim()) return;
    setLoading((l) => ({ ...l, oura: true }));
    try {
      const d = await apiJson<{ error?: string }>("/api/wearables/oura/connect", {
        method: "POST",
        body: JSON.stringify({ token: ouraToken.trim() }),
      });
      if (d.error) throw new Error(d.error);
      setOuraToken("");
      Alert.alert("Connected", "Oura Ring connected. Tap Fetch data to sync.");
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Could not connect Oura. Check your token.");
    } finally {
      setLoading((l) => ({ ...l, oura: false }));
    }
  };

  const fetchOura = async () => {
    setLoading((l) => ({ ...l, ouraFetch: true }));
    try {
      const res = await apiFetch("/api/wearables/oura/data");
      const d = await res.json();
      if (d.data && Array.isArray(d.data)) {
        await saveWearableData(d.data);
        Alert.alert("Synced", `Imported ${d.data.length} days of Oura data.`);
      } else if (d.error) {
        Alert.alert("Error", d.error);
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Could not fetch Oura data.");
    } finally {
      setLoading((l) => ({ ...l, ouraFetch: false }));
    }
  };

  const fetchFitbit = async () => {
    setLoading((l) => ({ ...l, fitbitFetch: true }));
    try {
      const res = await apiFetch("/api/wearables/fitbit/data");
      const d = await res.json();
      if (d.data && Array.isArray(d.data)) {
        await saveWearableData(d.data);
        Alert.alert("Synced", `Imported ${d.data.length} days of Fitbit data.`);
      } else if (d.error) {
        Alert.alert("Not connected", "Connect Fitbit first (opens in browser).");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading((l) => ({ ...l, fitbitFetch: false }));
    }
  };

  const openFitbitAuth = () => {
    Linking.openURL(`${API_BASE_URL}/api/wearables/fitbit/auth`);
  };

  const importHealth = async () => {
    if (!importJson.trim()) return;
    try {
      const json = JSON.parse(importJson);
      const raw = Array.isArray(json) ? json : json.data ?? [];
      if (!Array.isArray(raw)) throw new Error("Invalid format");
      const data: WearableDaySummary[] = raw.map((d: Record<string, unknown>) => ({
        ...d,
        date: String(d.date ?? ""),
        provider: (d.provider as WearableDaySummary["provider"]) ?? ("android" as const),
      }));
      await saveWearableData(data);
      setImportJson("");
      Alert.alert("Imported", `Added ${data.length} days of health data.`);
    } catch (e) {
      Alert.alert("Invalid JSON", "Paste valid JSON from Apple Health or Health Connect export.");
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Connect wearables</Text>
      <Text style={styles.subtitle}>
        Connect devices to see steps, sleep, and heart rate in your Weekly AI Review.
      </Text>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Oura Ring</Text>
        <Text style={styles.cardSub}>
          Get a Personal Access Token from cloud.ouraring.com and paste below.
        </Text>
        <TextInput
          style={styles.input}
          value={ouraToken}
          onChangeText={setOuraToken}
          placeholder="Oura token"
          placeholderTextColor={colors.muted}
          secureTextEntry
        />
        <View style={styles.row}>
          <Button
            title={loading.oura ? "Connecting…" : "Connect"}
            onPress={connectOura}
            loading={loading.oura}
            disabled={!ouraToken.trim()}
            style={styles.btn}
          />
          <Button
            title={loading.ouraFetch ? "Fetching…" : "Fetch data"}
            onPress={fetchOura}
            variant="secondary"
            loading={loading.ouraFetch}
            style={styles.btn}
          />
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Fitbit</Text>
        <Text style={styles.cardSub}>
          Fitbit trackers and watches. Connect via OAuth.
        </Text>
        <View style={styles.row}>
          <Button
            title="Connect Fitbit (OAuth)"
            onPress={openFitbitAuth}
            style={styles.btn}
          />
          <Button
            title={loading.fitbitFetch ? "Fetching…" : "Fetch data"}
            onPress={fetchFitbit}
            variant="secondary"
            loading={loading.fitbitFetch}
            style={styles.btn}
          />
        </View>
        <Text style={styles.hint}>
          Opens Fitbit login in browser. For full OAuth flow, use the web app. Fetch data works after connecting.
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Import from export</Text>
        <Text style={styles.cardSub}>
          Paste exported Apple Health / Health Connect JSON.
        </Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={importJson}
          onChangeText={setImportJson}
          placeholder='{"data": [{"date": "2025-02-10", "steps": 5000, ...}]}'
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={3}
        />
        <Button title="Import" onPress={importHealth} disabled={!importJson.trim()} />
      </Card>

      <Card flat style={styles.card}>
        <Text style={styles.cardTitle}>Apple Health (HealthKit)</Text>
        <Text style={styles.cardSub}>
          Native HealthKit sync requires a development build. Use Import above for now.
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing[5], paddingBottom: spacing[16] },
  title: {
    fontSize: fontSize.h4,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginBottom: spacing[2],
  },
  subtitle: {
    fontSize: fontSize.small,
    color: colors.muted,
    marginBottom: spacing[5],
  },
  card: { marginBottom: spacing[5] },
  cardTitle: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginBottom: spacing[1],
  },
  cardSub: {
    fontSize: fontSize.small,
    color: colors.muted,
    marginBottom: spacing[3],
  },
  input: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing[3],
    fontSize: fontSize.body,
    color: colors.foreground,
    marginBottom: spacing[3],
  },
  textarea: { minHeight: 80 },
  row: { flexDirection: "row", gap: spacing[3], flexWrap: "wrap" },
  btn: { flex: 1, minWidth: 120 },
  hint: {
    fontSize: fontSize.caption,
    color: colors.muted,
    marginTop: spacing[2],
  },
});
