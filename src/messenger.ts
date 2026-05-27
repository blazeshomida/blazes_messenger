/**
 * Create and run schema-validated messenger instances.
 *
 * This module contains the concrete {@link Messenger} implementation plus the
 * {@link createMessenger} factory. A messenger validates outbound payloads
 * before sending and validates inbound payloads by default before calling
 * subscribed handlers.
 *
 * @module messenger
 *
 * @example
 * ```ts
 * import { createMessenger, type StandardSchemaV1 } from "@blazes/messenger";
 *
 * const stringSchema: StandardSchemaV1<string> = {
 *   "~standard": {
 *     version: 1,
 *     vendor: "example",
 *     validate(value) {
 *       return typeof value === "string"
 *         ? { value }
 *         : { issues: [{ message: "Expected string." }] };
 *     },
 *   },
 * };
 *
 * let listener = (_message: unknown) => {};
 * let handled = "";
 *
 * const messenger = createMessenger({
 *   incoming: { message: stringSchema },
 *   outgoing: { message: stringSchema },
 *   send(message) {
 *     listener(message);
 *   },
 *   listen(next) {
 *     listener = next;
 *     return () => {
 *       listener = () => {};
 *     };
 *   },
 * });
 *
 * messenger.on("message", (payload) => {
 *   handled = payload;
 * });
 *
 * await messenger.emit("message", "hello");
 * await Promise.resolve();
 *
 * if (handled !== "hello") {
 *   throw new Error("Expected message to be handled.");
 * }
 *
 * messenger.dispose();
 * ```
 */

import {
  HandlerError,
  InvalidEnvelopeError,
  InvalidPayloadError,
  UnknownEventError,
} from "./errors.ts";
import type {
  EventName,
  EventSchemaMap,
  InferEventInputMap,
  InferEventOutputMap,
  MaybePromise,
  MessengerInstance,
  MessengerOptions,
  SubscribeOptions,
  Unsubscribe,
} from "./types.ts";
import { handleError, hasIssues, parseMessengerEnvelope } from "./_utils.ts";

interface Subscriber {
  readonly validate: boolean;
  readonly handler: (payload: unknown) => MaybePromise<void>;
}

/**
 * Coordinate typed event subscriptions with a caller-provided transport.
 *
 * A messenger starts listening as soon as it is constructed. Call
 * {@link Messenger.dispose | dispose()} when the transport listener should be
 * removed and all local subscribers cleared.
 *
 * @example
 * ```ts
 * import { Messenger, type StandardSchemaV1 } from "@blazes/messenger";
 *
 * const stringSchema: StandardSchemaV1<string> = {
 *   "~standard": {
 *     version: 1,
 *     vendor: "example",
 *     validate(value) {
 *       return typeof value === "string"
 *         ? { value }
 *         : { issues: [{ message: "Expected string." }] };
 *     },
 *   },
 * };
 *
 * let listener = (_message: unknown) => {};
 * let handled = "";
 *
 * const messenger = new Messenger({
 *   incoming: { message: stringSchema },
 *   outgoing: { message: stringSchema },
 *   send(message) {
 *     listener(message);
 *   },
 *   listen(next) {
 *     listener = next;
 *     return () => {
 *       listener = () => {};
 *     };
 *   },
 * });
 *
 * messenger.on("message", (payload) => {
 *   handled = payload;
 * });
 *
 * await messenger.emit("message", "hello");
 * await Promise.resolve();
 *
 * if (handled !== "hello") {
 *   throw new Error("Expected message to be handled.");
 * }
 *
 * messenger.dispose();
 * ```
 */
export class Messenger<
  IncomingSchemas extends EventSchemaMap,
  OutgoingSchemas extends EventSchemaMap,
> implements
  MessengerInstance<
    InferEventOutputMap<IncomingSchemas>,
    InferEventInputMap<OutgoingSchemas>
  > {
  readonly #subscribers = new Map<string, Set<Subscriber>>();
  readonly #defaultIncomingValidation: boolean;
  readonly #cleanup: Unsubscribe;

  /**
   * Create a messenger from schema maps and transport hooks.
   *
   * The {@link MessengerOptions.listen | listen} hook is called immediately and
   * must return the cleanup function used by
   * {@link Messenger.dispose | dispose()}.
   */
  constructor(
    readonly options: MessengerOptions<IncomingSchemas, OutgoingSchemas>,
  ) {
    this.#defaultIncomingValidation = options.validation?.incoming ?? true;
    this.#cleanup = options.listen((message) => {
      void this.#receive(message);
    });
  }

  /**
   * Validate and send an outbound event payload.
   *
   * The payload sent to the transport is the schema output value, which may be a
   * coerced or transformed version of the caller-provided input.
   *
   * @throws {UnknownEventError} If `type` is not present in
   * {@link MessengerOptions.outgoing | options.outgoing}.
   * @throws {InvalidPayloadError} If the outgoing schema rejects `payload`.
   * @throws If {@link MessengerOptions.send | options.send} throws or rejects.
   */
  async emit<Type extends EventName<InferEventInputMap<OutgoingSchemas>>>(
    type: Type,
    ...args: InferEventInputMap<OutgoingSchemas>[Type] extends undefined
      ? [payload?: undefined]
      : [payload: InferEventInputMap<OutgoingSchemas>[Type]]
  ): Promise<void> {
    const schema = this.options.outgoing[type];

    if (!schema) {
      throw new UnknownEventError(type);
    }

    const payload = args[0];
    const result = await schema["~standard"].validate(payload);

    if (hasIssues(result)) {
      throw new InvalidPayloadError({
        type,
        payload,
        issues: result.issues,
      });
    }

    await this.options.send({
      type,
      payload: result.value,
    });
  }

  /**
   * Subscribe to an inbound event.
   *
   * Returns an unsubscribe function. When validation is enabled, handlers receive
   * the schema output value for the inbound event; when validation is disabled,
   * handlers receive the raw envelope payload.
   *
   * @returns An {@link Unsubscribe} function for this handler.
   */
  on<Type extends EventName<InferEventOutputMap<IncomingSchemas>>>(
    type: Type,
    handler: (
      payload: InferEventOutputMap<IncomingSchemas>[Type],
    ) => MaybePromise<void>,
    subscribeOptions: SubscribeOptions = {},
  ): Unsubscribe {
    let handlers = this.#subscribers.get(type);

    if (!handlers) {
      handlers = new Set();
      this.#subscribers.set(type, handlers);
    }

    const subscriber: Subscriber = {
      validate: subscribeOptions.validate ?? this.#defaultIncomingValidation,

      handler(payload) {
        return handler(payload as InferEventOutputMap<IncomingSchemas>[Type]);
      },
    };

    handlers.add(subscriber);

    return () => {
      handlers.delete(subscriber);

      if (handlers.size === 0) {
        this.#subscribers.delete(type);
      }
    };
  }

  /**
   * Subscribe to the next matching inbound event, then unsubscribe.
   *
   * The subscription is removed before the handler runs, so a thrown or rejected
   * handler does not leave the one-shot subscription active.
   *
   * @returns An {@link Unsubscribe} function that may be called before the event
   * arrives.
   */
  once<Type extends EventName<InferEventOutputMap<IncomingSchemas>>>(
    type: Type,
    handler: (
      payload: InferEventOutputMap<IncomingSchemas>[Type],
    ) => MaybePromise<void>,
    subscribeOptions: SubscribeOptions = {},
  ): Unsubscribe {
    let called = false;
    const unsubscribe = this.on(
      type,
      async (payload) => {
        if (called) return;
        called = true;
        unsubscribe();
        await handler(payload);
      },
      subscribeOptions,
    );

    return unsubscribe;
  }

  /**
   * Remove all subscribers and unregister the inbound transport listener.
   */
  dispose(): void {
    this.#subscribers.clear();
    this.#cleanup();
  }

  async #receive(message: unknown) {
    const envelope = parseMessengerEnvelope(message);

    if (!envelope) {
      handleError(new InvalidEnvelopeError(message), this.options.onError);
      return;
    }

    const handlers = this.#subscribers.get(envelope.type);

    if (!handlers || handlers.size === 0) {
      return;
    }

    const schema = this.options.incoming[envelope.type];

    if (!schema) {
      handleError(new UnknownEventError(envelope.type), this.options.onError);
      return;
    }

    let validatedPayload: unknown;
    let hasValidatedPayload = false;

    for (const subscriber of handlers) {
      if (!subscriber.validate) {
        try {
          await subscriber.handler(envelope.payload);
        } catch (cause) {
          handleError(
            new HandlerError({
              type: envelope.type,
              cause,
            }),
            this.options.onError,
          );
        }

        continue;
      }

      if (!hasValidatedPayload) {
        const result = await schema["~standard"].validate(envelope.payload);

        if (hasIssues(result)) {
          handleError(
            new InvalidPayloadError({
              type: envelope.type,
              payload: envelope.payload,
              issues: result.issues,
            }),
            this.options.onError,
          );

          return;
        }

        validatedPayload = result.value;
        hasValidatedPayload = true;
      }

      try {
        await subscriber.handler(validatedPayload);
      } catch (cause) {
        handleError(
          new HandlerError({
            type: envelope.type,
            cause,
          }),
          this.options.onError,
        );
      }
    }
  }
}

/**
 * Create a typed messenger from schema maps and transport hooks.
 *
 * This is equivalent to `new Messenger(options)` and is useful when a factory
 * function fits local style better than direct class construction.
 *
 * @example
 * ```ts
 * import { createMessenger, type StandardSchemaV1 } from "@blazes/messenger";
 *
 * const stringSchema: StandardSchemaV1<string> = {
 *   "~standard": {
 *     version: 1,
 *     vendor: "example",
 *     validate(value) {
 *       return typeof value === "string"
 *         ? { value }
 *         : { issues: [{ message: "Expected string." }] };
 *     },
 *   },
 * };
 *
 * let listener = (_message: unknown) => {};
 * let handled = "";
 *
 * const messenger = createMessenger({
 *   incoming: { message: stringSchema },
 *   outgoing: { message: stringSchema },
 *   send(message) {
 *     listener(message);
 *   },
 *   listen(next) {
 *     listener = next;
 *     return () => {
 *       listener = () => {};
 *     };
 *   },
 * });
 *
 * messenger.on("message", (payload) => {
 *   handled = payload;
 * });
 *
 * await messenger.emit("message", "hello");
 * await Promise.resolve();
 *
 * if (handled !== "hello") {
 *   throw new Error("Expected message to be handled.");
 * }
 *
 * messenger.dispose();
 * ```
 */
export function createMessenger<
  IncomingSchemas extends EventSchemaMap,
  OutgoingSchemas extends EventSchemaMap,
>(
  options: MessengerOptions<IncomingSchemas, OutgoingSchemas>,
): Messenger<IncomingSchemas, OutgoingSchemas> {
  return new Messenger(options);
}
