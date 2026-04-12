import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { Alert } from "react-native";
import type { UserProfile } from "../lib/types";
import { setSentryUser } from "../lib/sentry";
import { identify } from "../lib/analytics";

const USER_ID_KEY = "recomp_uid";
const PROFILE_KEY = "recomp_profile";

interface AuthState {
  userId: string | null;
  profile: UserProfile | null;
  isHydrated: boolean;
  isDemoMode: boolean;
  sessionExpired: boolean;
  setUserId: (id: string | null) => Promise<void>;
  setProfile: (profile: UserProfile | null) => Promise<void>;
  setDemoMode: (demo: boolean) => void;
  checkAuth: () => Promise<void>;
  hydrate: () => Promise<void>;
  reset: () => Promise<void>;
  handleUnauthorized: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  userId: null,
  profile: null,
  isHydrated: false,
  isDemoMode: false,
  sessionExpired: false,

  setUserId: async (id) => {
    if (id) {
      await SecureStore.setItemAsync(USER_ID_KEY, id);
    } else {
      await SecureStore.deleteItemAsync(USER_ID_KEY);
    }
    setSentryUser(id);
    identify(id);
    set({ userId: id, sessionExpired: false });
  },

  setProfile: async (profile) => {
    if (profile) {
      await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(profile));
    } else {
      await SecureStore.deleteItemAsync(PROFILE_KEY);
    }
    set({ profile });
  },

  setDemoMode: (demo) => set({ isDemoMode: demo }),

  handleUnauthorized: () => {
    const { sessionExpired } = get();
    if (sessionExpired) return;
    set({ sessionExpired: true });
    Alert.alert(
      "Session Expired",
      "Your session has expired. Please sign in again.",
      [{ text: "OK", onPress: () => get().reset() }]
    );
  },

  checkAuth: async () => {
    const { userId } = get();
    if (!userId) return;
    try {
      const { apiJson } = await import("../lib/api");
      const res = await apiJson<{ authenticated: boolean }>("/api/auth/me");
      set({ isDemoMode: res.authenticated === false });
    } catch {
      set({ isDemoMode: true });
    }
  },

  hydrate: async () => {
    try {
      const userId = await SecureStore.getItemAsync(USER_ID_KEY);
      const profileRaw = await SecureStore.getItemAsync(PROFILE_KEY);
      const profile = profileRaw ? (JSON.parse(profileRaw) as UserProfile) : null;
      setSentryUser(userId);
      identify(userId);
      set({ userId, profile, isHydrated: true });
    } catch {
      set({ isHydrated: true });
    }
  },

  reset: async () => {
    await SecureStore.deleteItemAsync(USER_ID_KEY);
    await SecureStore.deleteItemAsync(PROFILE_KEY);
    setSentryUser(null);
    identify(null);
    set({ userId: null, profile: null, sessionExpired: false });
  },
}));
