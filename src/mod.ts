/**
 * Provide a typed event messenger for schema-validated message channels.
 *
 * {@link Messenger} and {@link createMessenger} connect
 * {@link StandardSchemaV1 | Standard Schema} payload validation to
 * caller-provided {@link SendMessage | send} and {@link ListenMessage | listen}
 * transport hooks. Event maps define the inbound events a peer may receive and
 * the outbound events it may emit. Outbound payloads are always validated;
 * inbound payloads are validated by default.
 *
 * @module @blazes/messenger
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

export * from "./standard-schema.v1.ts";
export * from "./errors.ts";
export * from "./types.ts";
export * from "./messenger.ts";
