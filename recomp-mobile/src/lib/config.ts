import Constants from "expo-constants";

/**
 * Environment configuration.
 *
 * In EAS builds, EXPO_PUBLIC_API_URL is injected at build time via eas.json.
 * In Expo Go, falls back to localhost for simulator or requires .env for device.
 */
const API_BASE_URL =
  Constants.expoConfig?.extra?.apiUrl ||
  process.env.EXPO_PUBLIC_API_URL ||
  (__DEV__ ? "http://localhost:3000" : "https://recomp-one.vercel.app");

/** Optional: Railway Act service URL for direct grocery calls (longer timeout than Vercel). */
let _act = (process.env.EXPO_PUBLIC_ACT_SERVICE_URL ?? "").trim().replace(/\/$/, "");
if (_act && !/^https?:\/\//i.test(_act)) _act = `https://${_act}`;
const ACT_SERVICE_URL = _act || null;

/** App version for analytics / error reporting. */
const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";

/** Runtime environment label. */
const ENVIRONMENT: "development" | "preview" | "production" = __DEV__
  ? "development"
  : (process.env.EXPO_PUBLIC_ENVIRONMENT as "preview" | "production") ?? "production";

export { API_BASE_URL, ACT_SERVICE_URL, APP_VERSION, ENVIRONMENT };
