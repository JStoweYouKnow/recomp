import { describe, it, expect, vi, beforeEach } from "vitest";
import { APPLE_HEALTH_EVENT_NAME, isAppleHealthSdkAvailable, requestAppleHealthSdkSync } from "./apple-health-bridge";

describe("apple-health-bridge", () => {
  beforeEach(() => {
    delete (window as Window & { webkit?: unknown }).webkit;
  });

  it("reports sdk bridge availability", () => {
    expect(isAppleHealthSdkAvailable()).toBe(false);
    (window as Window & {
      webkit?: { messageHandlers?: { healthkitSync?: { postMessage: (msg: unknown) => void } } };
    }).webkit = {
      messageHandlers: {
        healthkitSync: { postMessage: () => {} },
      },
    };
    expect(isAppleHealthSdkAvailable()).toBe(true);
  });

  it("requests sync and resolves with event payload", async () => {
    const postMessage = vi.fn(() => {
      window.dispatchEvent(
        new CustomEvent(APPLE_HEALTH_EVENT_NAME, {
          detail: { samples: [{ quantityTypeIdentifier: "HKQuantityTypeIdentifierStepCount", value: 3000 }] },
        })
      );
    });

    (window as Window & {
      webkit?: { messageHandlers?: { healthkitSync?: { postMessage: (msg: unknown) => void } } };
    }).webkit = {
      messageHandlers: {
        healthkitSync: { postMessage },
      },
    };

    await expect(requestAppleHealthSdkSync()).resolves.toEqual({
      samples: [{ quantityTypeIdentifier: "HKQuantityTypeIdentifierStepCount", value: 3000 }],
    });
    expect(postMessage).toHaveBeenCalledWith({ action: "requestSync" });
  });
});
