/**
 * `foldkit-agent/metakit`: the transitions of a metakit `Machine` as variants
 * for `Agent.expose`. Each one takes its input Schema, its JSON Schema and its
 * availability from the transition, so the guard written once in metakit is
 * what an agent is shown and what refuses its call.
 *
 * A separate entry point so that a page exposing no machine loads no metakit.
 */
import { Option, Predicate, Result } from 'effect'
import type { Schema } from 'effect'
import { type Expr, Verdict } from 'metakit'
import * as Inspect from 'metakit/inspect'
import { canDispatch, type Machine, type MessageOf } from 'metakit/machine'
import type { OperationDescription } from 'metakit/operation'
import type { ExposedMessages, Variant } from './expose.js'
import { type RefineInputJsonSchema, refineInputJsonSchema } from './jsonSchema.js'
import { type SnakeCase, defaultName } from './naming.js'
import type { ResourceOptions } from './resource.js'
import type { InvocationContext, VariantConfig } from './types.js'

/**
 * What `machineTools` reads of a bound agent (`Agent.forModel`,
 * `Agent.forApplication`, either `withPrincipal`): its Model and Principal,
 * so the tools fit that agent's `expose` with no annotation. Type-only.
 */
export interface BoundAgentTypes<Model, Principal> {
  readonly resource: (name: string, options: ResourceOptions<Model, any>) => unknown
  readonly make: (options: {
    readonly messages: ExposedMessages<any, Principal, any, any>
  }) => unknown
}

/** The decoded input a transition's `input` Schema produces. */
type InputOf<T> = T extends {
  readonly inputSchema: Option.Option<Schema.Codec<infer Input, any, any, any>>
}
  ? Input
  : never

/** What a tool adds to its transition: words for the agent, and the parts a transition cannot say. */
export interface ToolConfig<Input, MessageInput, Model, Principal, Name extends string> {
  /** The protocol-facing name. Defaults to the transition's key in snake_case. */
  readonly name?: Name
  readonly description: string
  /** Makes the Message payload from the decoded input. Defaults to the input itself. */
  readonly toMessage?: (input: Input, context: InvocationContext<Model, Principal>) => MessageInput
  /** Who may call it. The guard decides whether the state allows it; this decides who. */
  readonly authorize?: VariantConfig<MessageInput, Input, Model, Principal>['authorize']
}

/**
 * One transition's tool: call it with a description, or a `ToolConfig`, and
 * put the result under the Message tag it dispatches in `Agent.expose`.
 */
export interface Tool<Key extends string, Input, Model, Principal> {
  (description: string): Variant<Input, Input, Input, SnakeCase<Key>, Model, Principal, undefined>
  <MessageInput = Input, const Name extends string = SnakeCase<Key>>(
    config: ToolConfig<Input, MessageInput, Model, Principal, Name>,
  ): Variant<Input, Input, MessageInput, Name, Model, Principal, undefined>
}

/** A tool for every transition of the machine, keyed as the machine keys them. */
export type MachineTools<Transitions, Model, Principal> = {
  readonly [Key in keyof Transitions & string]: Tool<
    Key,
    InputOf<Transitions[Key]>,
    Model,
    Principal
  >
}

/** The keywords metakit adds that Effect's JSON Schema derivation cannot see. */
const ADDED_KEYWORDS = ['enum', 'format', 'x-metakit-domain'] as const

/**
 * Bounds from both sources are kept at the tighter of the two: metakit does
 * not see every Effect check, such as the safe-integer range of `Schema.Int`.
 */
const LOWER_BOUNDS = ['minimum', 'exclusiveMinimum'] as const
const UPPER_BOUNDS = ['maximum', 'exclusiveMaximum'] as const

const tighter = (
  derived: unknown,
  declared: unknown,
  pick: (a: number, b: number) => number,
): unknown =>
  typeof derived === 'number' && typeof declared === 'number' ? pick(derived, declared) : declared

/** One property's derived schema, with metakit's constraints for the same field added. */
const constrained = (
  derived: Readonly<Record<PropertyKey, unknown>>,
  declared: Readonly<Record<PropertyKey, unknown>>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...derived }
  for (const keyword of ADDED_KEYWORDS) {
    if (Object.hasOwn(declared, keyword)) result[keyword] = declared[keyword]
  }
  for (const keyword of LOWER_BOUNDS) {
    if (Object.hasOwn(declared, keyword))
      result[keyword] = tighter(derived[keyword], declared[keyword], Math.max)
  }
  for (const keyword of UPPER_BOUNDS) {
    if (Object.hasOwn(declared, keyword))
      result[keyword] = tighter(derived[keyword], declared[keyword], Math.min)
  }
  return result
}

/**
 * Adds `Inspect.toJsonSchema`'s per-field constraints to the schema `expose`
 * derived. Built on the derived schema rather than replacing it: metakit's
 * describes scalar fields only, and would advertise an array or nested struct
 * as a string, and an optional field as required.
 */
const addDeclaredConstraints =
  (
    declared: Readonly<Record<string, unknown>>,
    operations?: ReadonlyArray<OperationDescription>,
  ): RefineInputJsonSchema =>
  derived => {
    const properties = derived['properties']
    const declaredProperties = declared['properties']
    const base =
      !Predicate.isObject(properties) || !Predicate.isObject(declaredProperties)
        ? derived
        : {
            ...derived,
            properties: Object.fromEntries(
              Object.entries(properties).map(([field, schema]) => {
                const fieldDeclared = Object.hasOwn(declaredProperties, field)
                  ? declaredProperties[field]
                  : undefined
                return [
                  field,
                  Predicate.isObject(schema) && Predicate.isObject(fieldDeclared)
                    ? constrained(schema, fieldDeclared)
                    : schema,
                ]
              }),
            ),
            // What dispatch enforces: it decodes with excess properties refused.
            additionalProperties: false,
          }
    return operations !== undefined && operations.length > 0
      ? { ...base, 'x-metakit-operations': operations }
      : base
  }

/**
 * A variant for `Agent.expose` from each transition of a metakit `Machine`:
 *
 * - its `input` is the transition's input Schema, and its JSON Schema adds the
 *   bounds and domain formats metakit reads from it (`Inspect.toJsonSchema`);
 * - it is `available` unless the transition's guard is `False` for the
 *   current state (`Machine.canDispatch`). A guard that needs the input to
 *   decide, or reads an opaque term, is `Unknown` and stays available;
 * - a call whose input the guard refuses in that state is refused before
 *   dispatch, as `CapabilityUnavailableError`, after `authorize`;
 * - a tool given `authorize` is always available, and its guard is asked only
 *   after `authorize` allows the call: a caller it refuses gets the same list
 *   and the same answer whatever the state.
 *
 * Give the Message it dispatches by its key in `expose`; `update` applies the
 * transition when that Message arrives (`machine.update`).
 *
 * ```ts
 * const Tools = machineTools({ agent: BankAgent, machine: AccountMachine, state: model => model.account })
 * BankAgent.expose(Message, { Withdraw: Tools.Withdraw('Withdraw from the account') })
 * ```
 */
export const machineTools = <
  State,
  Transitions extends Readonly<Record<string, unknown>>,
  Model,
  Principal,
>(
  options: {
    readonly agent: BoundAgentTypes<Model, Principal>
    readonly machine: Machine<State, Transitions>
    /** Implementations for custom `Operation.define` operations called by transitions. */
    readonly foreign?: Expr.ReaderOptions['foreign'] | undefined
    /** Domain language whose `describe()` is listed on each tool's input schema (`x-metakit-operations`). */
    readonly language?: { readonly describe: () => ReadonlyArray<OperationDescription> } | undefined
  } & ([Model] extends [State]
    ? { readonly state?: ((model: Model) => State) | undefined }
    : { readonly state: (model: Model) => State }),
): MachineTools<Transitions, Model, Principal> => {
  const { machine } = options
  const state: (model: Model) => State =
    options.state ?? ((model: Model) => model as unknown as State)
  const readerOptions: Expr.ReaderOptions | undefined =
    options.foreign === undefined ? undefined : { foreign: options.foreign }
  const operations = options.language?.describe()
  // A transition may be named `__proto__`, which a plain object would take as its prototype.
  const tools: Record<string, unknown> = Object.create(null)

  for (const key of Object.keys(machine.transitions)) {
    const transition = machine.transitions[key] as {
      readonly inputSchema: Option.Option<Schema.Codec<unknown, unknown, never, never>>
    }
    const input = Option.getOrThrowWith(
      transition.inputSchema,
      () => new Error(`Cannot make a tool of "${key}": the transition declares no input Schema`),
    )
    const refine = addDeclaredConstraints(Inspect.toJsonSchema(input), operations)
    const tag = key as keyof Transitions & string

    const available = (model: Model): boolean =>
      // A whole state is a partial one; the conditional type cannot see that of a generic `State`.
      !Verdict.isFalse(
        canDispatch(machine, tag, { state: state(model) as Expr.PartialEnv<State> }, readerOptions),
      )

    // Evaluated, not judged: with the whole input there is nothing left
    // unknown, and this is the evaluation `machine.update` will run.
    const allows = (model: Model, decoded: unknown): boolean =>
      Result.isSuccess(
        machine.dispatch(
          state(model),
          { _tag: tag, input: decoded } as MessageOf<Transitions>,
          readerOptions,
        ),
      )

    tools[key] = (
      config: string | ToolConfig<unknown, unknown, Model, Principal, string>,
    ): Record<PropertyKey, unknown> => {
      const declared = typeof config === 'string' ? { description: config } : config
      const name = declared.name ?? defaultName(key)
      const refused = {
        applies: false,
        reason: `"${name}" does not allow this input in the current state`,
      } as const
      return {
        name,
        description: declared.description,
        input,
        toMessage: declared.toMessage ?? ((decoded: unknown) => decoded),
        authorize: declared.authorize,
        // Availability is asked before `authorize` and shown in the tool list,
        // so with `authorize` it would tell a refused caller what the state is:
        // the tool is then always listed, and `applies` runs the whole guard.
        ...(declared.authorize === undefined ? { available } : {}),
        applies: ({ input: decoded, model }: { readonly input: unknown; readonly model: Model }) =>
          allows(model, decoded) || refused,
        [refineInputJsonSchema]: refine,
      }
    }
  }

  return tools as MachineTools<Transitions, Model, Principal>
}
