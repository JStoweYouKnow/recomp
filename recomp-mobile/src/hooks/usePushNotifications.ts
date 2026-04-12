import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  registerForPushNotifications,
  subscribeExpoPushToken,
  unsubscribeExpoAll,
} from "../lib/push";

const STORAGE_KEY = "recomp_push_enabled";

export function usePushNotifications() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      setEnabled(v === "true");
    });
  }, []);

  const enable = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const t = await registerForPushNotifications();
      if (!t) {
        setError("Could not get push token. Use a physical device.");
        return;
      }
      const ok = await subscribeExpoPushToken(t);
      if (ok) {
        setEnabled(true);
        await AsyncStorage.setItem(STORAGE_KEY, "true");
      } else {
        setError("Could not subscribe. Try again.");
      }
    } catch {
      setError("Failed to enable notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await unsubscribeExpoAll();
      setEnabled(false);
      await AsyncStorage.setItem(STORAGE_KEY, "false");
    } catch {
      setError("Could not unsubscribe.");
    } finally {
      setLoading(false);
    }
  }, []);

  return { enabled, loading, error, enable, disable };
}
