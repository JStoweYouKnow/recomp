import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  authenticateAsync: jest.fn(),
  AuthenticationType: {
    FINGERPRINT: 1,
    FACIAL_RECOGNITION: 2,
    IRIS: 3,
  },
}));

import * as LocalAuthentication from "expo-local-authentication";
import {
  isBiometricAvailable,
  isBiometricEnabled,
  setBiometricEnabled,
  getBiometricType,
  authenticate,
  shouldRequireAuth,
  recordBackgroundTime,
} from "../biometric";

const mockLA = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;
const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe("biometric", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue(undefined);
    mockAsyncStorage.removeItem.mockResolvedValue(undefined);
  });

  describe("isBiometricAvailable", () => {
    it("returns false when hardware not available", async () => {
      mockLA.hasHardwareAsync.mockResolvedValue(false);
      expect(await isBiometricAvailable()).toBe(false);
    });

    it("returns false when not enrolled", async () => {
      mockLA.hasHardwareAsync.mockResolvedValue(true);
      mockLA.isEnrolledAsync.mockResolvedValue(false);
      expect(await isBiometricAvailable()).toBe(false);
    });

    it("returns true when hardware available and enrolled", async () => {
      mockLA.hasHardwareAsync.mockResolvedValue(true);
      mockLA.isEnrolledAsync.mockResolvedValue(true);
      expect(await isBiometricAvailable()).toBe(true);
    });
  });

  describe("getBiometricType", () => {
    it("returns Face ID for facial recognition", async () => {
      mockLA.supportedAuthenticationTypesAsync.mockResolvedValue([
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
      ]);
      expect(await getBiometricType()).toBe("Face ID");
    });

    it("returns Fingerprint for fingerprint", async () => {
      mockLA.supportedAuthenticationTypesAsync.mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);
      expect(await getBiometricType()).toBe("Fingerprint");
    });

    it("returns Biometric as fallback", async () => {
      mockLA.supportedAuthenticationTypesAsync.mockResolvedValue([]);
      expect(await getBiometricType()).toBe("Biometric");
    });
  });

  describe("isBiometricEnabled / setBiometricEnabled", () => {
    it("returns false by default", async () => {
      expect(await isBiometricEnabled()).toBe(false);
    });

    it("returns true when enabled", async () => {
      mockAsyncStorage.getItem.mockResolvedValue("1");
      expect(await isBiometricEnabled()).toBe(true);
    });

    it("enables biometric", async () => {
      await setBiometricEnabled(true);
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith("recomp_biometric_enabled", "1");
    });

    it("disables biometric", async () => {
      await setBiometricEnabled(false);
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith("recomp_biometric_enabled");
    });
  });

  describe("authenticate", () => {
    it("returns true on success", async () => {
      mockLA.authenticateAsync.mockResolvedValue({ success: true });
      expect(await authenticate()).toBe(true);
    });

    it("returns false on failure", async () => {
      mockLA.authenticateAsync.mockResolvedValue({
        success: false,
        error: "user_cancel",
      });
      expect(await authenticate()).toBe(false);
    });
  });

  describe("shouldRequireAuth", () => {
    it("returns false when biometric not enabled", async () => {
      expect(await shouldRequireAuth()).toBe(false);
    });

    it("returns true when no background timestamp exists", async () => {
      // First call: biometric enabled check
      mockAsyncStorage.getItem
        .mockResolvedValueOnce("1") // biometric enabled
        .mockResolvedValueOnce(null); // no bg timestamp
      expect(await shouldRequireAuth()).toBe(true);
    });

    it("returns false when within timeout", async () => {
      mockAsyncStorage.getItem
        .mockResolvedValueOnce("1") // biometric enabled
        .mockResolvedValueOnce(String(Date.now() - 1000)); // 1 sec ago
      expect(await shouldRequireAuth()).toBe(false);
    });

    it("returns true when past timeout", async () => {
      mockAsyncStorage.getItem
        .mockResolvedValueOnce("1") // biometric enabled
        .mockResolvedValueOnce(String(Date.now() - 6 * 60 * 1000)); // 6 min ago
      expect(await shouldRequireAuth()).toBe(true);
    });
  });

  describe("recordBackgroundTime", () => {
    it("saves current timestamp", async () => {
      const before = Date.now();
      await recordBackgroundTime();
      expect(mockAsyncStorage.setItem).toHaveBeenCalledTimes(1);
      const [key, value] = mockAsyncStorage.setItem.mock.calls[0];
      expect(key).toBe("recomp_bg_timestamp");
      const ts = parseInt(value, 10);
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(Date.now());
    });
  });
});
