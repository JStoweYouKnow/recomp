/**
 * Standardized API response helpers for consistent error format across routes.
 * All error responses include: { error: string; code?: string; detail?: string }
 */

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMIT"
  | "INTERNAL_ERROR";

export function errorResponse(
  error: string,
  status: number,
  options?: { code?: ApiErrorCode; detail?: string }
): Response {
  const body: { error: string; code?: string; detail?: string } = { error };
  if (options?.code) body.code = options.code;
  if (options?.detail) body.detail = options.detail;
  return Response.json(body, { status });
}

export function validationError(message: string, detail?: string): Response {
  return errorResponse(message, 400, { code: "VALIDATION_ERROR", detail });
}

export function unauthorized(message = "Authentication required"): Response {
  return errorResponse(message, 401, { code: "UNAUTHORIZED" });
}

export function forbidden(message = "Access denied"): Response {
  return errorResponse(message, 403, { code: "FORBIDDEN" });
}

export function notFound(message = "Not found"): Response {
  return errorResponse(message, 404, { code: "NOT_FOUND" });
}

export function rateLimitError(message = "Rate limit exceeded"): Response {
  return errorResponse(message, 429, { code: "RATE_LIMIT" });
}

export function internalError(message: string, err?: unknown): Response {
  const detail = err instanceof Error ? err.message : err != null ? String(err) : undefined;
  return errorResponse(message, 500, { code: "INTERNAL_ERROR", detail });
}
