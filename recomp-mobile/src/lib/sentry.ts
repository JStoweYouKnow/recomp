import * as Sentry from "@sentry/react-native";
import { APP_VERSION, ENVIRONMENT } from "./config";

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";

export function initSentry() {
  if (!SENTRY_DSN) {
    if (__DEV__) console.log("[Sentry] No DSN configured, skipping init");
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT,
    release: `recomp-mobile@${APP_VERSION}`,
    tracesSampleRate: ENVIRONMENT === "production" ? 0.2 : 1.0,
    enableAutoSessionTracking: true,
    attachScreenshot: true,
    enableNativeFramesTracking: true,

    beforeSend(event) {
      // Strip PII from breadcrumbs in production
      if (ENVIRONMENT === "production" && event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((bc) => {
          if (bc.category === "fetch" && bc.data?.url) {
            // Keep path but strip query params which may contain tokens
            const url = bc.data.url as string;
            const qIdx = url.indexOf("?");
            if (qIdx !== -1) bc.data.url = url.slice(0, qIdx) + "?[redacted]";
          }
          return bc;
        });
      }
      return event;
    },
  });
}

/** Set user context after auth. */
export function setSentryUser(userId: string | null) {
  if (!SENTRY_DSN) return;
  if (userId) {
    Sentry.setUser({ id: userId });
  } else {
    Sentry.setUser(null);
  }
}

/** Add navigation breadcrumb. */
export function addNavigationBreadcrumb(routeName: string) {
  if (!SENTRY_DSN) return;
  Sentry.addBreadcrumb({
    category: "navigation",
    message: `Navigate to ${routeName}`,
    level: "info",
  });
}

/** Capture a handled exception with optional context. */
export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (!SENTRY_DSN) {
    console.error("[Sentry] Would capture:", error, context);
    return;
  }
  Sentry.withScope((scope) => {
    if (context) scope.setExtras(context);
    Sentry.captureException(error);
  });
}

export { Sentry };
