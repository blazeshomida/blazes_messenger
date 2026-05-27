/**
 * Define public types used by typed messenger instances.
 *
 * These types connect {@link StandardSchemaV1 | Standard Schema} validators to
 * event names, transport envelopes, subscription handles, and messenger options.
 *
 * @module types
 */

import type { MessengerErrorHandler } from "./errors.ts";
import type { StandardSchemaV1 } from "./standard-schema.v1.ts";

/**
 * Map event names to Standard Schema validators for their payloads.
 *
 * Each key becomes a typed event name for {@link MessengerInstance.emit},
 * {@link MessengerInstance.on}, and {@link MessengerInstance.once}.
 */
export interface EventSchemaMap {
  /**
   * Store a schema under each supported event name.
   */
  readonly [event: string]: StandardSchemaV1;
}

/**
 * Infer the input payload type for each schema in an event schema map.
 *
 * This is used for outbound payloads accepted by
 * {@link MessengerInstance.emit}.
 */
export type InferEventInputMap<Schemas extends EventSchemaMap> = {
  readonly [Type in keyof Schemas]: StandardSchemaV1.InferInput<Schemas[Type]>;
};

/**
 * Infer the validated output payload type for each schema in an event schema map.
 *
 * This is used for inbound payloads received by
 * {@link MessengerInstance.on} and {@link MessengerInstance.once}.
 */
export type InferEventOutputMap<Schemas extends EventSchemaMap> = {
  readonly [Type in keyof Schemas]: StandardSchemaV1.InferOutput<Schemas[Type]>;
};

/**
 * Represent the wire format sent between messenger peers.
 *
 * {@link MessengerOptions.send} receives this format after outbound validation,
 * and {@link MessengerOptions.listen} must pass received values in this shape
 * for inbound validation and dispatch.
 *
 * @example
 * ```ts
 * import type { MessengerEnvelope } from "@blazes/messenger";
 *
 * const message: MessengerEnvelope = {
 *   type: "ready",
 *   payload: { id: "worker-1" },
 * };
 *
 * if (message.type !== "ready") {
 *   throw new Error("Unexpected event type.");
 * }
 * ```
 */
export interface MessengerEnvelope {
  /**
   * Identify the event schema and subscribers associated with the payload.
   */
  readonly type: string;
  /**
   * Carry the event payload before or after schema validation.
   */
  readonly payload: unknown;
}

/**
 * Remove a previously registered listener.
 *
 * Returned by {@link ListenMessage}, {@link MessengerInstance.on}, and
 * {@link MessengerInstance.once}.
 */
export type Unsubscribe = () => void;

/**
 * Allow an operation to complete synchronously or asynchronously.
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Send a validated envelope to the underlying transport.
 *
 * @example
 * ```ts
 * import type { SendMessage } from "@blazes/messenger";
 *
 * const sent: string[] = [];
 *
 * const send: SendMessage = (message) => {
 *   sent.push(JSON.stringify(message));
 * };
 *
 * await send({ type: "ready", payload: "worker-1" });
 *
 * if (sent.length !== 1) {
 *   throw new Error("Expected one sent message.");
 * }
 * ```
 */
export type SendMessage = (message: MessengerEnvelope) => MaybePromise<void>;

/**
 * Register the messenger's inbound listener with the underlying transport.
 *
 * @returns A cleanup function that unregisters the listener.
 *
 * @example
 * ```ts
 * import type { ListenMessage } from "@blazes/messenger";
 *
 * let currentListener = (_message: unknown) => {};
 *
 * const listen: ListenMessage = (listener) => {
 *   currentListener = listener;
 *
 *   return () => {
 *     currentListener = () => {};
 *   };
 * };
 *
 * const unsubscribe = listen((message) => {
 *   if (message === null) {
 *     throw new Error("Unexpected message.");
 *   }
 * });
 *
 * currentListener({ type: "ready", payload: "worker-1" });
 * unsubscribe();
 * ```
 */
export type ListenMessage = (
  listener: (message: unknown) => void,
) => Unsubscribe;

/**
 * Extract string event names from an event map.
 */
export type EventName<Events> = Extract<keyof Events, string>;

/**
 * Configure validation defaults for a messenger.
 */
export interface MessengerValidationOptions {
  /**
   * Enable validation for incoming subscriber payloads by default.
   *
   * Incoming validation defaults to `true`.
   */
  readonly incoming?: boolean;
}

/**
 * Configure one subscription.
 *
 * Passed to {@link MessengerInstance.on} and {@link MessengerInstance.once}.
 */
export interface SubscribeOptions {
  /**
   * Override incoming validation for this subscription.
   *
   * When `false`, the handler receives the raw envelope payload.
   */
  readonly validate?: boolean;
}

/**
 * Configure a messenger instance.
 *
 * Pass this to {@link createMessenger} or the {@link Messenger} constructor.
 */
export interface MessengerOptions<
  IncomingSchemas extends EventSchemaMap,
  OutgoingSchemas extends EventSchemaMap,
> {
  /**
   * Define events this messenger can receive.
   *
   * These schemas validate payloads before subscribed handlers run.
   */
  readonly incoming: IncomingSchemas;
  /**
   * Define events this messenger can emit.
   *
   * These schemas validate payloads before {@link MessengerOptions.send | send}
   * is called.
   */
  readonly outgoing: OutgoingSchemas;
  /**
   * Configure validation behavior.
   */
  readonly validation?: MessengerValidationOptions;
  /**
   * Send outbound envelopes after payload validation.
   */
  readonly send: SendMessage;
  /**
   * Register the inbound envelope listener.
   */
  readonly listen: ListenMessage;
  /**
   * Handle inbound validation and subscriber errors.
   *
   * Handler errors are rethrown in a microtask when no error handler is provided.
   */
  readonly onError?: MessengerErrorHandler;
}

/**
 * Describe a typed messenger instance.
 *
 * Implemented by {@link Messenger}.
 */
export interface MessengerInstance<
  IncomingEvents,
  OutgoingInputEvents,
> {
  /**
   * Validate and send an outbound event payload.
   *
   * @throws {UnknownEventError} If the event is not present in the outgoing map.
   * @throws {InvalidPayloadError} If the outgoing schema rejects the payload.
   * @throws If the configured send hook throws or rejects.
   */
  emit<Type extends EventName<OutgoingInputEvents>>(
    type: Type,
    ...args: OutgoingInputEvents[Type] extends undefined ? [payload?: undefined]
      : [payload: OutgoingInputEvents[Type]]
  ): Promise<void>;

  /**
   * Subscribe to an inbound event.
   *
   * @returns An unsubscribe function for this handler.
   */
  on<Type extends EventName<IncomingEvents>>(
    type: Type,
    handler: (payload: IncomingEvents[Type]) => MaybePromise<void>,
    options?: SubscribeOptions,
  ): Unsubscribe;

  /**
   * Subscribe to the next matching inbound event, then unsubscribe.
   *
   * @returns An unsubscribe function that may be called before the event arrives.
   */
  once<Type extends EventName<IncomingEvents>>(
    type: Type,
    handler: (payload: IncomingEvents[Type]) => MaybePromise<void>,
    options?: SubscribeOptions,
  ): Unsubscribe;

  /**
   * Remove all subscribers and unregister the inbound transport listener.
   */
  dispose(): void;
}
