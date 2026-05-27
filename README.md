# @blazes/messenger

Typed event messenger for schema-validated message channels.

[Source](https://github.com/blazeshomida/blazes_messenger)

`@blazes/messenger` turns any message transport into a typed event API. Provide
the schemas for messages you can receive and emit, then connect the messenger to
your transport with `send` and `listen` hooks.

Outgoing payloads are always validated before they are sent. Incoming payloads
are validated by default before subscribers receive them.

## Add to your project

```sh
deno add jsr:@blazes/messenger
```

This package accepts any
[Standard Schema v1](https://standardschema.dev/)-compatible validator.

## Basic Usage

```ts
import {
  createMessenger,
  type MessengerEnvelope,
  type StandardSchemaV1,
} from "@blazes/messenger";

interface ReadyPayload {
  readonly id: string;
}

interface PingPayload {
  readonly id: string;
  readonly sentAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function schema<T>(
  guard: (value: unknown) => value is T,
): StandardSchemaV1<T> {
  return {
    "~standard": {
      version: 1,
      vendor: "example",
      validate(value) {
        return guard(value)
          ? { value }
          : { issues: [{ message: "Invalid payload." }] };
      },
    },
  };
}

const readySchema = schema<ReadyPayload>((value): value is ReadyPayload =>
  isRecord(value) && typeof value.id === "string"
);

const pingSchema = schema<PingPayload>((value): value is PingPayload =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.sentAt === "number"
);

let receive: (message: unknown) => void = () => {};
const sent: MessengerEnvelope[] = [];

const messenger = createMessenger({
  incoming: {
    ready: readySchema,
  },
  outgoing: {
    ping: pingSchema,
  },
  send(message) {
    sent.push(message);
  },
  listen(listener) {
    receive = listener;

    return () => {
      receive = () => {};
    };
  },
});

let readyId = "";

const unsubscribe = messenger.on("ready", (payload) => {
  // payload is typed as ReadyPayload.
  readyId = payload.id;
});

await messenger.emit("ping", {
  id: "request-1",
  sentAt: Date.now(),
});

receive({ type: "ready", payload: { id: "worker-1" } });
await Promise.resolve();

if (sent[0]?.type !== "ping") {
  throw new Error("Expected ping to be sent.");
}

if (readyId !== "worker-1") {
  throw new Error("Expected ready payload to be handled.");
}

unsubscribe();
messenger.dispose();
```

Event names and payload types are inferred from the schema maps. Calling
`emit()` with an unknown event name or invalid payload is a type error in typed
code and a validation error at runtime.

## Transports

A messenger only depends on a transport that can send envelopes and register an
inbound listener.

```ts
import type { ListenMessage, SendMessage } from "@blazes/messenger";

interface JsonSocket {
  send(data: string): void;
  addEventListener(
    type: "message",
    listener: (event: { data: string }) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: { data: string }) => void,
  ): void;
}

const socket: JsonSocket = {
  send() {},
  addEventListener() {},
  removeEventListener() {},
};

const send: SendMessage = (message) => {
  socket.send(JSON.stringify(message));
};

const listen: ListenMessage = (listener) => {
  const onMessage = (event: { data: string }) => {
    listener(JSON.parse(event.data));
  };

  socket.addEventListener("message", onMessage);

  return () => socket.removeEventListener("message", onMessage);
};

send({ type: "ping", payload: "hello" });
const unsubscribe = listen(() => {});
unsubscribe();
```

The wire format is intentionally small:

```ts
import type { MessengerEnvelope } from "@blazes/messenger";

const message: MessengerEnvelope = {
  type: "ready",
  payload: { id: "worker-1" },
};

if (message.type !== "ready") {
  throw new Error("Unexpected event type.");
}
```

This works with `MessagePort`, `Worker`, `BroadcastChannel`, `WebSocket`,
extension ports, test doubles, and custom in-process buses.

## One-Time Subscribers

Use `once()` when only the next matching event should be handled.

```ts
import { createMessenger, type StandardSchemaV1 } from "@blazes/messenger";

const stringSchema: StandardSchemaV1<string> = {
  "~standard": {
    version: 1,
    vendor: "example",
    validate(value) {
      return typeof value === "string"
        ? { value }
        : { issues: [{ message: "Expected string." }] };
    },
  },
};

let receive: (message: unknown) => void = () => {};

const messenger = createMessenger({
  incoming: { ready: stringSchema },
  outgoing: {},
  send() {},
  listen(listener) {
    receive = listener;
    return () => {
      receive = () => {};
    };
  },
});

let handled = "";

messenger.once("ready", (payload) => {
  handled = payload;
});

receive({ type: "ready", payload: "worker-1" });
receive({ type: "ready", payload: "worker-2" });
await Promise.resolve();

if (handled !== "worker-1") {
  throw new Error("Expected only the first ready event to be handled.");
}

messenger.dispose();
```

The subscription is removed before the handler runs, so a reentrant message will
not call the same `once()` handler twice.

## Validation

Outgoing messages are always validated with the matching outgoing schema.

Incoming validation is enabled by default. You can turn it off for all
subscribers or for a single subscription when the transport is trusted or the
payload has already been validated.

```ts
import { createMessenger, type StandardSchemaV1 } from "@blazes/messenger";

const stringSchema: StandardSchemaV1<string> = {
  "~standard": {
    version: 1,
    vendor: "example",
    validate(value) {
      return typeof value === "string"
        ? { value }
        : { issues: [{ message: "Expected string." }] };
    },
  },
};

let receive: (message: unknown) => void = () => {};

const messenger = createMessenger({
  incoming: { ready: stringSchema },
  outgoing: {},
  validation: {
    incoming: false,
  },
  send() {},
  listen(listener) {
    receive = listener;
    return () => {
      receive = () => {};
    };
  },
});

let handled = "";

messenger.on(
  "ready",
  (payload) => {
    handled = payload;
  },
  {
    validate: true,
  },
);

receive({ type: "ready", payload: "worker-1" });
await Promise.resolve();

if (handled !== "worker-1") {
  throw new Error("Expected validated ready payload.");
}

messenger.dispose();
```

When multiple subscribers for the same event validate incoming payloads, the
payload is validated once and the validated value is shared with those
subscribers.

## Errors

`emit()` validates the outgoing payload before calling `send`. It rejects with a
messenger error when validation cannot proceed, and it also propagates errors
from the caller-provided `send` hook.

| Error                 | Reported by | When it happens                                         |
| --------------------- | ----------- | ------------------------------------------------------- |
| `UnknownEventError`   | `emit()`    | The event name is missing from the outgoing schema map. |
| `InvalidPayloadError` | `emit()`    | The outgoing payload fails schema validation.           |
| Any thrown value      | `emit()`    | The `send` hook throws or rejects.                      |

Inbound failures are reported to `onError`.

| Error                  | When it happens                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `InvalidEnvelopeError` | The transport listener receives a value that is not a `{ type, payload }` envelope.              |
| `UnknownEventError`    | A subscribed inbound event has no matching incoming schema. This mainly affects untyped callers. |
| `InvalidPayloadError`  | An inbound envelope payload fails the matching incoming schema.                                  |
| `HandlerError`         | An inbound subscriber throws or rejects. The original value is available as `error.cause`.       |

Messages with no subscribers are ignored before schema lookup and do not report
an error.

```ts
import {
  createMessenger,
  HandlerError,
  InvalidEnvelopeError,
  InvalidPayloadError,
  type MessengerError,
  type StandardSchemaV1,
  UnknownEventError,
} from "@blazes/messenger";

const stringSchema: StandardSchemaV1<string> = {
  "~standard": {
    version: 1,
    vendor: "example",
    validate(value) {
      return typeof value === "string"
        ? { value }
        : { issues: [{ message: "Expected string." }] };
    },
  },
};

const errors: MessengerError[] = [];
let receive: (message: unknown) => void = () => {};
let handled = "";

const messenger = createMessenger({
  incoming: { ready: stringSchema },
  outgoing: {},
  send() {},
  listen(listener) {
    receive = listener;
    return () => {
      receive = () => {};
    };
  },
  onError(error) {
    errors.push(error);

    if (error instanceof InvalidEnvelopeError) {
      void error.value;
      return;
    }

    if (error instanceof InvalidPayloadError) {
      void error.type;
      void error.issues;
      return;
    }

    if (error instanceof UnknownEventError) {
      void error.type;
      return;
    }

    if (error instanceof HandlerError) {
      void error.type;
      void error.cause;
    }
  },
});

messenger.on("ready", (payload) => {
  handled = payload;
});

messenger.on("ready", () => {
  throw new Error("handler failed");
});

const untypedMessenger = messenger as unknown as {
  on(type: string, handler: (payload: unknown) => void): () => void;
};

const unsubscribeUnknown = untypedMessenger.on("missing", () => {});

receive(null);
receive({ type: "ready", payload: 123 });
receive({ type: "missing", payload: "ignored" });
receive({ type: "ready", payload: "worker-1" });
await Promise.resolve();
await Promise.resolve();

if (!errors.some((error) => error instanceof InvalidEnvelopeError)) {
  throw new Error("Expected invalid envelope error.");
}

if (!errors.some((error) => error instanceof InvalidPayloadError)) {
  throw new Error("Expected invalid payload error.");
}

if (!errors.some((error) => error instanceof UnknownEventError)) {
  throw new Error("Expected unknown event error.");
}

if (!errors.some((error) => error instanceof HandlerError)) {
  throw new Error("Expected handler error.");
}

if (handled !== "worker-1") {
  throw new Error("Expected valid payload to be handled.");
}

unsubscribeUnknown();
messenger.dispose();
```

If `onError` is omitted, inbound validation, envelope, and unknown-event errors
are ignored. Handler failures are thrown asynchronously so they are still
visible during development.

## API

| Symbol                                                                                                       | Description                                                       |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| [`createMessenger(options)`](https://jsr.io/@blazes/messenger/doc/~/createMessenger)                         | Creates a typed messenger instance.                               |
| [`Messenger`](https://jsr.io/@blazes/messenger/doc/~/Messenger)                                              | Class implementation used by `createMessenger()`.                 |
| [`messenger.emit(type, payload)`](https://jsr.io/@blazes/messenger/doc/~/Messenger.prototype.emit)           | Validates and sends an outbound event.                            |
| [`messenger.on(type, handler, options?)`](https://jsr.io/@blazes/messenger/doc/~/Messenger.prototype.on)     | Subscribes to an inbound event.                                   |
| [`messenger.once(type, handler, options?)`](https://jsr.io/@blazes/messenger/doc/~/Messenger.prototype.once) | Subscribes to the next inbound event, then unsubscribes.          |
| [`messenger.dispose()`](https://jsr.io/@blazes/messenger/doc/~/Messenger.prototype.dispose)                  | Removes all subscribers and unregisters the transport listener.   |
| [`StandardSchemaV1`](https://jsr.io/@blazes/messenger/doc/~/StandardSchemaV1)                                | Validator interface used by incoming and outgoing event schemas.  |
| [`MessengerEnvelope`](https://jsr.io/@blazes/messenger/doc/~/MessengerEnvelope)                              | `{ type, payload }` wire format.                                  |
| [`MessengerOptions`](https://jsr.io/@blazes/messenger/doc/~/MessengerOptions)                                | Schema maps, transport hooks, validation settings, and `onError`. |
| [`SendMessage`](https://jsr.io/@blazes/messenger/doc/~/SendMessage)                                          | Transport hook for sending validated envelopes.                   |
| [`ListenMessage`](https://jsr.io/@blazes/messenger/doc/~/ListenMessage)                                      | Transport hook for registering the inbound listener.              |
| [`SubscribeOptions`](https://jsr.io/@blazes/messenger/doc/~/SubscribeOptions)                                | Per-subscription validation options.                              |
| [`InvalidEnvelopeError`](https://jsr.io/@blazes/messenger/doc/~/InvalidEnvelopeError)                        | Received value was not a messenger envelope.                      |
| [`UnknownEventError`](https://jsr.io/@blazes/messenger/doc/~/UnknownEventError)                              | Event name did not have a matching schema.                        |
| [`InvalidPayloadError`](https://jsr.io/@blazes/messenger/doc/~/InvalidPayloadError)                          | Payload failed Standard Schema validation.                        |
| [`HandlerError`](https://jsr.io/@blazes/messenger/doc/~/HandlerError)                                        | Subscriber threw or rejected.                                     |
| [`MessengerError`](https://jsr.io/@blazes/messenger/doc/~/MessengerError)                                    | Union of inbound errors passed to `onError`.                      |
| [`MessengerErrorHandler`](https://jsr.io/@blazes/messenger/doc/~/MessengerErrorHandler)                      | Callback for inbound messenger errors.                            |

## Development

Run the full local check before publishing:

```sh
deno task check
```

Run the documentation examples:

```sh
deno task docs:test
```
