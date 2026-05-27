/**
 * Define errors reported by messenger validation and inbound processing.
 *
 * Outbound validation and unknown-event errors are thrown from
 * {@link MessengerInstance.emit}; errors from the configured send hook are
 * propagated unchanged. Inbound envelope, validation, unknown-event, and handler
 * errors are passed to the configured
 * {@link MessengerOptions.onError | onError} callback.
 *
 * @module errors
 */

import type { StandardSchemaV1 } from "./standard-schema.v1.ts";

/**
 * Report that a received value is not a messenger envelope.
 *
 * This is reported to {@link MessengerOptions.onError | onError} when the
 * transport listener receives a value that is not a {@link MessengerEnvelope}.
 *
 * @example
 * ```ts
 * import { InvalidEnvelopeError } from "@blazes/messenger";
 *
 * const error = new InvalidEnvelopeError(null);
 *
 * if (error.name !== "InvalidEnvelopeError" || error.value !== null) {
 *   throw new Error("Unexpected invalid envelope error.");
 * }
 * ```
 */
export class InvalidEnvelopeError extends Error {
  /**
   * Identify the error for narrowing and logging.
   */
  override readonly name = "InvalidEnvelopeError";

  /**
   * Store the invalid value received from the transport.
   */
  readonly value: unknown;

  /**
   * Create an invalid envelope error.
   */
  constructor(value: unknown) {
    super("Invalid messenger envelope.");
    this.value = value;
  }
}

/**
 * Report that an event has no matching schema.
 *
 * This is thrown by {@link MessengerInstance.emit} for unknown outbound events
 * and reported to {@link MessengerOptions.onError | onError} for subscribed
 * inbound events that have no incoming schema.
 *
 * @example
 * ```ts
 * import { UnknownEventError } from "@blazes/messenger";
 *
 * const error = new UnknownEventError("missing");
 *
 * if (error.name !== "UnknownEventError" || error.type !== "missing") {
 *   throw new Error("Unexpected unknown event error.");
 * }
 * ```
 */
export class UnknownEventError extends Error {
  /**
   * Identify the error for narrowing and logging.
   */
  override readonly name = "UnknownEventError";

  /**
   * Store the event name that was not present in the schema map.
   */
  readonly type: string;

  /**
   * Create an unknown event error.
   */
  constructor(type: string) {
    super(`Unknown messenger event "${type}".`);
    this.type = type;
  }
}

/**
 * Report that a payload failed schema validation.
 *
 * This is thrown by {@link MessengerInstance.emit} for invalid outbound payloads
 * and reported to {@link MessengerOptions.onError | onError} for invalid inbound
 * payloads.
 *
 * @example
 * ```ts
 * import { InvalidPayloadError } from "@blazes/messenger";
 *
 * const error = new InvalidPayloadError({
 *   type: "ready",
 *   payload: 123,
 *   issues: [{ message: "Expected string." }],
 * });
 *
 * if (error.name !== "InvalidPayloadError" || error.issues.length !== 1) {
 *   throw new Error("Unexpected invalid payload error.");
 * }
 * ```
 */
export class InvalidPayloadError extends Error {
  /**
   * Identify the error for narrowing and logging.
   */
  override readonly name = "InvalidPayloadError";

  /**
   * Store the event name whose payload failed validation.
   */
  readonly type: string;
  /**
   * Store the payload value that failed validation.
   */
  readonly payload: unknown;
  /**
   * Store validation issues returned by the schema.
   */
  readonly issues: readonly StandardSchemaV1.Issue[];

  /**
   * Create an invalid payload error.
   */
  constructor(options: {
    type: string;
    payload: unknown;
    issues: readonly StandardSchemaV1.Issue[];
  }) {
    super(`Invalid payload for messenger event "${options.type}".`);
    this.type = options.type;
    this.payload = options.payload;
    this.issues = options.issues;
  }
}

/**
 * Report that an inbound event handler threw or rejected.
 *
 * This is reported to {@link MessengerOptions.onError | onError}. If no error
 * handler is configured, handler failures are thrown asynchronously.
 *
 * @example
 * ```ts
 * import { HandlerError } from "@blazes/messenger";
 *
 * const cause = new Error("failed");
 * const error = new HandlerError({
 *   type: "ready",
 *   cause,
 * });
 *
 * if (error.name !== "HandlerError" || error.cause !== cause) {
 *   throw new Error("Unexpected handler error.");
 * }
 * ```
 */
export class HandlerError extends Error {
  /**
   * Identify the error for narrowing and logging.
   */
  override readonly name = "HandlerError";

  /**
   * Store the event name being handled when the failure happened.
   */
  readonly type: string;
  /**
   * Store the original thrown or rejected value.
   */
  override readonly cause: unknown;

  /**
   * Create a handler error.
   */
  constructor(options: {
    type: string;
    cause: unknown;
  }) {
    super(`Messenger handler failed for event "${options.type}".`);
    this.type = options.type;
    this.cause = options.cause;
  }
}

/**
 * Collect errors reported by inbound messenger processing.
 *
 * Used by {@link MessengerErrorHandler}.
 */
export type MessengerError =
  | InvalidEnvelopeError
  | UnknownEventError
  | InvalidPayloadError
  | HandlerError;

/**
 * Handle validation, envelope, unknown event, and subscriber errors.
 *
 * Pass this as {@link MessengerOptions.onError | onError} when creating a
 * messenger.
 */
export type MessengerErrorHandler = (error: MessengerError) => void;
