import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BIOMETRIC_ENABLED_KEY = "recomp_biometric_enabled";
const BACKGROUND_TIMESTAMP_KEY = "recomp_bg_timestamp";

/** Lock timeout: require re-auth after 5 minutes in background. */
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

/** Check if the device supports biometric authentication. */
export async function isBiometricAvailable(): Promise<boolean> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) return false;
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return enrolled;
}

/** Get supported biometric types for display (Face ID, fingerprint, etc). */
export async function getBiometricType(): Promise<string> {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return "Face ID";
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return "Fingerprint";
  }
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return "Iris";
  }
  return "Biometric";
}

/** Check if user has opted into biometric lock. */
export async function isBiometricEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
  return val === "1";
}

/** Enable or disable biometric lock. */
export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, "1");
  } else {
    await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY);
  }
}

/** Prompt the user for biometric authentication. */
export async function authenticate(promptMessage?: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: promptMessage ?? "Unlock Recomp",
    fallbackLabel: "Use passcode",
    cancelLabel: "Cancel",
    disableDeviceFallback: false,
  });
  return result.success;
}

/** Record when app goes to background. */
export async function recordBackgroundTime(): Promise<void> {
  await AsyncStorage.setItem(BACKGROUND_TIMESTAMP_KEY, Date.now().toString());
}

/** Check if biometric re-auth is needed after returning from background. */
export async function shouldRequireAuth(): Promise<boolean> {
  const enabled = await isBiometricEnabled();
  if (!enabled) return false;

  const raw = await AsyncStorage.getItem(BACKGROUND_TIMESTAMP_KEY);
  if (!raw) return true;

  const bgTime = parseInt(raw, 10);
  return Date.now() - bgTime > LOCK_TIMEOUT_MS;
}
