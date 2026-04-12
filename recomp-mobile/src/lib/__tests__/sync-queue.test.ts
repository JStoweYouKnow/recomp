import AsyncStorage from "@react-native-async-storage/async-storage";

// Mock dependencies before importing module
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock("@react-native-community/netinfo", () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock("../api", () => ({
  apiFetch: jest.fn(),
}));

jest.mock("../sentry", () => ({
  captureError: jest.fn(),
}));

import { enqueue, flush, getPendingCount } from "../sync-queue";
import { apiFetch } from "../api";

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe("sync-queue", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue(undefined);
  });

  describe("enqueue", () => {
    it("adds an operation to the queue", async () => {
      await enqueue("/api/data/sync", "POST", { test: true });

      expect(mockAsyncStorage.setItem).toHaveBeenCalledTimes(1);
      const [key, value] = mockAsyncStorage.setItem.mock.calls[0];
      expect(key).toBe("recomp_sync_queue");
      const parsed = JSON.parse(value);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].path).toBe("/api/data/sync");
      expect(parsed[0].method).toBe("POST");
    });

    it("appends to existing queue", async () => {
      const existing = [
        { id: "1", path: "/api/old", method: "POST", body: "{}", createdAt: "", retries: 0 },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existing));

      await enqueue("/api/new", "POST", {});

      const [, value] = mockAsyncStorage.setItem.mock.calls[0];
      const parsed = JSON.parse(value);
      expect(parsed).toHaveLength(2);
    });
  });

  describe("getPendingCount", () => {
    it("returns 0 for empty queue", async () => {
      expect(await getPendingCount()).toBe(0);
    });

    it("returns correct count", async () => {
      const queue = [
        { id: "1", path: "/a", method: "POST", body: "{}", createdAt: "", retries: 0 },
        { id: "2", path: "/b", method: "POST", body: "{}", createdAt: "", retries: 0 },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(queue));
      expect(await getPendingCount()).toBe(2);
    });
  });

  describe("flush", () => {
    it("returns 0 when queue is empty", async () => {
      const result = await flush();
      expect(result).toBe(0);
    });

    it("processes and removes successful operations", async () => {
      const queue = [
        { id: "1", path: "/api/test", method: "POST", body: '{"a":1}', createdAt: "", retries: 0 },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(queue));
      mockApiFetch.mockResolvedValue({ ok: true, status: 200 } as Response);

      const result = await flush();

      expect(result).toBe(1);
      expect(mockApiFetch).toHaveBeenCalledWith("/api/test", {
        method: "POST",
        body: '{"a":1}',
      });
      // Queue should be empty after successful flush
      const [, savedValue] = mockAsyncStorage.setItem.mock.calls[
        mockAsyncStorage.setItem.mock.calls.length - 1
      ];
      expect(JSON.parse(savedValue)).toHaveLength(0);
    });

    it("retries server errors with incremented retry count", async () => {
      const queue = [
        { id: "1", path: "/api/test", method: "POST", body: "{}", createdAt: "", retries: 0 },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(queue));
      mockApiFetch.mockResolvedValue({ ok: false, status: 500 } as Response);

      const result = await flush();

      expect(result).toBe(0);
      const [, savedValue] = mockAsyncStorage.setItem.mock.calls[
        mockAsyncStorage.setItem.mock.calls.length - 1
      ];
      const remaining = JSON.parse(savedValue);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].retries).toBe(1);
    });

    it("drops client errors (4xx except 429)", async () => {
      const queue = [
        { id: "1", path: "/api/test", method: "POST", body: "{}", createdAt: "", retries: 0 },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(queue));
      mockApiFetch.mockResolvedValue({ ok: false, status: 400 } as Response);

      const result = await flush();

      expect(result).toBe(1); // dropped = counted as processed
      const [, savedValue] = mockAsyncStorage.setItem.mock.calls[
        mockAsyncStorage.setItem.mock.calls.length - 1
      ];
      expect(JSON.parse(savedValue)).toHaveLength(0);
    });
  });
});
