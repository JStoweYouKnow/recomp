import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock("../config", () => ({
  ENVIRONMENT: "development",
}));

import { track, flushEvents, identify, Events } from "../analytics";

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe("analytics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue(undefined);
    mockAsyncStorage.removeItem.mockResolvedValue(undefined);
  });

  describe("track", () => {
    it("stores events in AsyncStorage", async () => {
      await track(Events.MEAL_LOGGED, { method: "text" });

      expect(mockAsyncStorage.setItem).toHaveBeenCalledTimes(1);
      const [key, value] = mockAsyncStorage.setItem.mock.calls[0];
      expect(key).toBe("recomp_analytics_events");
      const events = JSON.parse(value);
      expect(events).toHaveLength(1);
      expect(events[0].name).toBe("meal_logged");
      expect(events[0].properties.method).toBe("text");
    });

    it("appends to existing events", async () => {
      const existing = [{ name: "old", timestamp: "2025-01-01T00:00:00Z" }];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existing));

      await track(Events.MEAL_LOGGED);

      const [, value] = mockAsyncStorage.setItem.mock.calls[0];
      const events = JSON.parse(value);
      expect(events).toHaveLength(2);
    });

    it("includes userId after identify", async () => {
      identify("user-123");
      await track(Events.ONBOARDING_COMPLETED);

      const [, value] = mockAsyncStorage.setItem.mock.calls[0];
      const events = JSON.parse(value);
      expect(events[0].properties.userId).toBe("user-123");
    });
  });

  describe("flushEvents", () => {
    it("returns empty array when no events", async () => {
      const events = await flushEvents();
      expect(events).toEqual([]);
    });

    it("returns and clears stored events", async () => {
      const stored = [
        { name: "test", timestamp: "2025-01-01T00:00:00Z" },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(stored));

      const events = await flushEvents();

      expect(events).toHaveLength(1);
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith("recomp_analytics_events");
    });
  });

  describe("Events constants", () => {
    it("has unique event names", () => {
      const values = Object.values(Events);
      const unique = new Set(values);
      expect(unique.size).toBe(values.length);
    });
  });
});
