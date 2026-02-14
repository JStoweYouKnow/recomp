/**
 * Structured logging for API routes and server-side code.
 * Use for debugging, monitoring, and audit trails.
 * In production, these can be wired to CloudWatch, Datadog, etc.
 */

type LogLevel = "info" | "warn" | "error" | "debug";

type LogContext = {
  route?: string;
  userId?: string;
  durationMs?: number;
  [key: string]: unknown;
};

function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const ctx = context ? ` ${JSON.stringify(context)}` : "";
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${ctx}`;
}

export function logInfo(message: string, context?: LogContext): void {
  console.log(formatMessage("info", message, context));
}

export function logWarn(message: string, context?: LogContext): void {
  console.warn(formatMessage("warn", message, context));
}

export function logError(message: string, err?: unknown, context?: LogContext): void {
  const ctx = {
    ...context,
    ...(err instanceof Error && { error: err.message, stack: err.stack }),
  };
  console.error(formatMessage("error", message, ctx));
}

export function logDebug(message: string, context?: LogContext): void {
  if (process.env.NODE_ENV === "development") {
    console.debug(formatMessage("debug", message, context));
  }
}
