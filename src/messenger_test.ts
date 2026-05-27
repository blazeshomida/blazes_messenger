import {
  HandlerError,
  InvalidEnvelopeError,
  InvalidPayloadError,
  Messenger,
  type MessengerEnvelope,
  type StandardSchemaV1,
} from "./mod.ts";

function schema<Input, Output = Input>(
  validate: (value: unknown) => StandardSchemaV1.Result<Output>,
): StandardSchemaV1<Input, Output> {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate,
    },
  };
}

const stringSchema = schema<string>((value) =>
  typeof value === "string"
    ? { value }
    : { issues: [{ message: "Expected string." }] }
);

Deno.test("emit validates and sends outbound payloads", async () => {
  const sent: MessengerEnvelope[] = [];
  const messenger = new Messenger({
    incoming: {},
    outgoing: {
      ping: stringSchema,
    },
    send(message) {
      sent.push(message);
    },
    listen() {
      return () => {};
    },
  });

  await messenger.emit("ping", "hello");

  if (sent.length !== 1) {
    throw new Error(`Expected one message, received ${sent.length}.`);
  }

  if (sent[0].type !== "ping" || sent[0].payload !== "hello") {
    throw new Error("Unexpected sent envelope.");
  }
});

Deno.test("emit rejects invalid outbound payloads", async () => {
  const messenger = new Messenger({
    incoming: {},
    outgoing: {
      ping: stringSchema,
    },
    send() {
      throw new Error("send should not be called");
    },
    listen() {
      return () => {};
    },
  });

  let error: unknown;

  try {
    // @ts-expect-error Runtime validation still rejects values from untyped callers.
    await messenger.emit("ping", 123);
  } catch (cause) {
    error = cause;
  }

  if (!(error instanceof InvalidPayloadError)) {
    throw new Error("Expected InvalidPayloadError.");
  }
});

Deno.test("on validates inbound payloads before calling subscribers", async () => {
  let listener: (message: unknown) => void = () => {};
  let received: string | undefined;

  const messenger = new Messenger({
    incoming: {
      pong: stringSchema,
    },
    outgoing: {},
    send() {},
    listen(next) {
      listener = next;
      return () => {};
    },
  });

  messenger.on("pong", (payload) => {
    received = payload;
  });

  listener({ type: "pong", payload: "ready" });
  await Promise.resolve();

  if (received !== "ready") {
    throw new Error("Expected validated payload.");
  }
});

Deno.test("on reports invalid envelopes and payloads", async () => {
  let listener: (message: unknown) => void = () => {};
  const errors: unknown[] = [];

  const messenger = new Messenger({
    incoming: {
      pong: stringSchema,
    },
    outgoing: {},
    send() {},
    listen(next) {
      listener = next;
      return () => {};
    },
    onError(error) {
      errors.push(error);
    },
  });

  messenger.on("pong", () => {
    throw new Error("handler should not be called");
  });

  listener(null);
  listener({ type: "pong", payload: 123 });
  await Promise.resolve();

  if (!(errors[0] instanceof InvalidEnvelopeError)) {
    throw new Error("Expected InvalidEnvelopeError.");
  }

  if (!(errors[1] instanceof InvalidPayloadError)) {
    throw new Error("Expected InvalidPayloadError.");
  }
});

Deno.test("once unsubscribes before handling", async () => {
  let listener: (message: unknown) => void = () => {};
  let calls = 0;

  const messenger = new Messenger({
    incoming: {
      pong: stringSchema,
    },
    outgoing: {},
    send() {},
    listen(next) {
      listener = next;
      return () => {};
    },
  });

  messenger.once("pong", () => {
    calls += 1;
  });

  listener({ type: "pong", payload: "one" });
  listener({ type: "pong", payload: "two" });
  await Promise.resolve();

  if (calls !== 1) {
    throw new Error(`Expected one call, received ${calls}.`);
  }
});

Deno.test("handler failures are reported", async () => {
  let listener: (message: unknown) => void = () => {};
  let error: unknown;

  const messenger = new Messenger({
    incoming: {
      pong: stringSchema,
    },
    outgoing: {},
    send() {},
    listen(next) {
      listener = next;
      return () => {};
    },
    onError(nextError) {
      error = nextError;
    },
  });

  messenger.on("pong", () => {
    throw new Error("failed");
  });

  listener({ type: "pong", payload: "ready" });
  await Promise.resolve();

  if (!(error instanceof HandlerError)) {
    throw new Error("Expected HandlerError.");
  }
});
