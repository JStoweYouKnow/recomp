import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { apiJson } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data ?? null;
  } catch {
    return null;
  }
}

export async function subscribeExpoPushToken(token: string): Promise<boolean> {
  try {
    await apiJson("/api/push/subscribe-expo", {
      method: "POST",
      body: JSON.stringify({ expoPushToken: token }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function unsubscribeExpoPushToken(token: string): Promise<boolean> {
  try {
    await apiJson("/api/push/unsubscribe-expo", {
      method: "POST",
      body: JSON.stringify({ expoPushToken: token }),
    });
    return true;
  } catch {
    return false;
  }
}

/** Unsubscribe all Expo tokens for the current user (e.g. when disabling notifications). */
export async function unsubscribeExpoAll(): Promise<boolean> {
  try {
    await apiJson("/api/push/unsubscribe-expo-all", { method: "POST" });
    return true;
  } catch {
    return false;
  }
}
