/**
 * Define the Standard Schema v1 compatibility types used by messenger schemas.
 *
 * These declarations mirror the public Standard Schema contract closely enough
 * for libraries such as Valibot, ArkType, and Zod-compatible adapters to provide
 * typed payload validation for {@link MessengerOptions.incoming | incoming} and
 * {@link MessengerOptions.outgoing | outgoing} event maps.
 *
 * @module standard-schema.v1
 *
 * @see {@link https://standardschema.dev | Standard Schema}
 */

/**
 * Represent a Standard Schema v1 validator.
 *
 * @example
 * ```ts
 * import type { StandardSchemaV1 } from "@blazes/messenger";
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
 * const result = await stringSchema["~standard"].validate("hello");
 *
 * if ("issues" in result) {
 *   throw new Error("Expected valid string.");
 * }
 * ```
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  /**
   * Expose Standard Schema metadata and validation behavior.
   */
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

/**
 * Group supporting types for the Standard Schema v1 interface.
 */
export declare namespace StandardSchemaV1 {
  /**
   * Describe Standard Schema metadata and validation behavior.
   */
  export interface Props<Input = unknown, Output = Input> {
    /**
     * Identify the Standard Schema version.
     */
    readonly version: 1;
    /**
     * Identify the schema library vendor.
     */
    readonly vendor: string;
    /**
     * Validate an unknown input value.
     *
     * @returns A success result with typed output or a failure result with issues.
     */
    readonly validate: (
      value: unknown,
      options?: StandardSchemaV1.Options | undefined,
    ) => Result<Output> | Promise<Result<Output>>;
    /**
     * Carry inferred input and output types for TypeScript consumers.
     */
    readonly types?: Types<Input, Output> | undefined;
  }

  /**
   * Represent the result of a schema validation attempt.
   */
  export type Result<Output> = SuccessResult<Output> | FailureResult;

  /**
   * Represent a successful schema validation result.
   */
  export interface SuccessResult<Output> {
    /**
     * Store the typed output value.
     */
    readonly value: Output;
    /**
     * Omit validation issues to indicate success.
     */
    readonly issues?: undefined;
  }

  /**
   * Configure a Standard Schema validation attempt.
   */
  export interface Options {
    /**
     * Pass additional vendor-specific parameters, when needed.
     */
    readonly libraryOptions?: Record<string, unknown> | undefined;
  }

  /**
   * Represent a failed schema validation result.
   */
  export interface FailureResult {
    /**
     * Store validation issues returned by the schema.
     */
    readonly issues: ReadonlyArray<Issue>;
  }

  /**
   * Describe one validation issue.
   */
  export interface Issue {
    /**
     * Store the validation error message.
     */
    readonly message: string;
    /**
     * Store the path to the invalid value, when available.
     */
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }

  /**
   * Describe one path segment in a validation issue.
   */
  export interface PathSegment {
    /**
     * Store the key represented by this path segment.
     */
    readonly key: PropertyKey;
  }

  /**
   * Carry the inferred input and output types of a schema.
   */
  export interface Types<Input = unknown, Output = Input> {
    /**
     * Represent the input type accepted by the schema.
     */
    readonly input: Input;
    /**
     * Represent the output type produced after validation.
     */
    readonly output: Output;
  }

  /**
   * Infer the input type of a Standard Schema.
   *
   * @example
   * ```ts
   * import type { StandardSchemaV1 } from "@blazes/messenger";
   *
   * type Input = StandardSchemaV1.InferInput<StandardSchemaV1<string>>;
   * const value: Input = "hello";
   *
   * if (value !== "hello") {
   *   throw new Error("Unexpected inferred input.");
   * }
   * ```
   */
  export type InferInput<Schema extends StandardSchemaV1> = NonNullable<
    Schema["~standard"]["types"]
  >["input"];

  /**
   * Infer the output type of a Standard Schema.
   *
   * @example
   * ```ts
   * import type { StandardSchemaV1 } from "@blazes/messenger";
   *
   * type Output = StandardSchemaV1.InferOutput<StandardSchemaV1<string>>;
   * const value: Output = "hello";
   *
   * if (value !== "hello") {
   *   throw new Error("Unexpected inferred output.");
   * }
   * ```
   */
  export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<
    Schema["~standard"]["types"]
  >["output"];
}
