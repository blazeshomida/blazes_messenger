import type { MessengerError, MessengerErrorHandler } from "./errors.ts";
import type { StandardSchemaV1 } from "./standard-schema.v1.ts";
import type { MessengerEnvelope } from "./types.ts";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseMessengerEnvelope(
  value: unknown,
): MessengerEnvelope | null {
  if (!isRecord(value)) return null;
  if (typeof value.type !== "string") return null;
  if (!("payload" in value)) return null;

  return {
    type: value.type,
    payload: value.payload,
  };
}

export function hasIssues<Output>(
  result: StandardSchemaV1.Result<Output>,
): result is StandardSchemaV1.FailureResult {
  return "issues" in result && Array.isArray(result.issues);
}

export function handleError(
  error: MessengerError,
  onError: MessengerErrorHandler | undefined,
) {
  if (onError) {
    onError(error);
    return;
  }

  if (error.name === "HandlerError") {
    queueMicrotask(() => {
      throw error;
    });
  }
}
