export const APPLE_HEALTH_EVENT_NAME = "recomp:apple-health-data";

type AppleHealthPayload = unknown;

type AppleHealthMessageHandler = {
  postMessage: (message: { action: "requestSync" }) => void;
};

function getMessageHandler(): AppleHealthMessageHandler | null {
  if (typeof window === "undefined") return null;
  const maybeHandler = (
    window as Window & {
      webkit?: { messageHandlers?: { healthkitSync?: AppleHealthMessageHandler } };
    }
  ).webkit?.messageHandlers?.healthkitSync;
  return maybeHandler ?? null;
}

export function isAppleHealthSdkAvailable(): boolean {
  return getMessageHandler() !== null;
}

export async function requestAppleHealthSdkSync(timeoutMs = 20_000): Promise<AppleHealthPayload> {
  const handler = getMessageHandler();
  if (!handler) {
    throw new Error("Apple Health SDK bridge is not available in this browser");
  }

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for Apple Health SDK response"));
    }, timeoutMs);

    const onPayload = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      cleanup();
      resolve(event.detail);
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener(APPLE_HEALTH_EVENT_NAME, onPayload as EventListener);
    };

    window.addEventListener(APPLE_HEALTH_EVENT_NAME, onPayload as EventListener, { once: true });

    try {
      handler.postMessage({ action: "requestSync" });
    } catch (err) {
      cleanup();
      reject(err instanceof Error ? err : new Error("Failed to request Apple Health sync"));
    }
  });
}
