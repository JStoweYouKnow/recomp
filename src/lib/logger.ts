/**
 * Structured logging for API routes and server-side code.
 *
 * Outputs CloudWatch-compatible structured JSON in production so logs are
 * automatically parsed by CloudWatch Logs Insights, Datadog, or any JSON
 * log aggregator. Falls back to human-readable format in development.
 */

type LogLevel = "info" | "warn" | "error" | "debug";

export type LogContext = {
  route?: string;
  userId?: string;
  durationMs?: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  statusCode?: number;
  [key: string]: unknown;
};

const isProduction = process.env.NODE_ENV === "production";

function formatStructured(level: LogLevel, message: string, context?: LogContext): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message,
    ...context,
  });
}

function formatHuman(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const ctx = context ? ` ${JSON.stringify(context)}` : "";
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${ctx}`;
}

function format(level: LogLevel, message: string, context?: LogContext): string {
  return isProduction
    ? formatStructured(level, message, context)
    : formatHuman(level, message, context);
}

export function logInfo(message: string, context?: LogContext): void {
  console.log(format("info", message, context));
}

export function logWarn(message: string, context?: LogContext): void {
  console.warn(format("warn", message, context));
}

export function logError(message: string, err?: unknown, context?: LogContext): void {
  const ctx: LogContext = {
    ...context,
    ...(err instanceof Error && { error: err.message, stack: err.stack }),
  };
  console.error(format("error", message, ctx));
}

export function logDebug(message: string, context?: LogContext): void {
  if (!isProduction) {
    console.debug(format("debug", message, context));
  }
}

/**
 * Wrap an async API handler to automatically log request duration and errors.
 * Usage: export const POST = withRequestLogging("/api/meals/suggest", handler);
 */
export function withRequestLogging<T>(
  route: string,
  handler: (req: Request) => Promise<T>,
): (req: Request) => Promise<T> {
  return async (req: Request) => {
    const start = Date.now();
    try {
      const result = await handler(req);
      logInfo("request completed", { route, durationMs: Date.now() - start });
      return result;
    } catch (err) {
      logError("request failed", err, { route, durationMs: Date.now() - start });
      throw err;
    }
  };
}
