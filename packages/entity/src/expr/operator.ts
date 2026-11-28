/**
 * Operators (`Expr.operator`): checked where declared and where called. A
 * defined operator's call is what its body builds; a primitive one's is built
 * by `primitive.ts`. A call keeps its operator and arguments in the origin
 * map, for `Expr.show`, `Query.operators` and a write's wire form.
 */
import { Option, Schema, SchemaAST } from 'effect'
import { Node } from '@doeixd/metakit'
import * as Operation from '@doeixd/metakit/operation'
import type { Collation } from '../collation.js'
import { readKeys } from './dependencies.js'
import {
  collationOf,
  exprOf,
  inputKeyOf,
  made,
  toNode,
  type AnyExpr,
  type Expr,
  type Predicate,
  type Reads,
  type ReadsOf,
} from './operand.js'
import { kindOf } from './kind.js'
import {
  callOperator,
  kernel,
  registerForeign,
  storedKindOf,
  type KernelBuild,
} from './primitive.js'
import { show } from './show.js'
import type { EntityField } from '../index.js'

/**
 * What an operator is: its identity, the stored form of what it takes and
 * gives, and, for an operator defined by an expression, how to build that
 * expression. It computes nothing itself. Identity is this object; `id` and
 * `version` name it.
 */
export interface OperatorDescriptor {
  readonly _tag: 'Operator'
  readonly id: string
  readonly version: number
  readonly description: Option.Option<string>
  /** One schema per argument, read as the stored form. */
  readonly input: ReadonlyArray<Schema.Top>
  readonly output: Schema.Top
  /**
   * Builds the expression a call means, from its arguments: an operator defined
   * by an expression. None for a primitive operator, which each interpreter
   * implements (`Operators`).
   */
  readonly definedAs: Option.Option<(...args: ReadonlyArray<AnyExpr>) => unknown>
  /**
   * A primitive operator's null rule. `strict`: a null argument gives null, or
   * unknown for a predicate, and the implementation never sees one. `own`:
   * the implementation is given nulls and answers for them.
   */
  readonly nulls: 'strict' | 'own'
  /**
   * How a call compares text. `operands`: it carries the collation its collated
   * text arguments share, so its text result compares under it. `required`: the
   * same, refused where none is declared (it compares text itself, as
   * `Text.startsWith` does). `none`: it carries none.
   */
  readonly collation: 'none' | 'operands' | 'required'
  /** Algebraic claims every implementation keeps (`@doeixd/metakit/operation`), checked by `checkOperation`. */
  readonly claims: Node.ForeignClaims
}

/** A schema's stored form, which is what an operator takes and gives. */
type StoredOf<S extends Schema.Top> = Schema.Codec.Encoded<S>

/**
 * One argument an operator may be called with: a field or expression stored
 * as the input's stored type, a predicate where it takes a boolean, or a plain
 * value.
 */
export type ArgumentOf<S extends Schema.Top> =
  | EntityField<string, string, Schema.Constraint & Schema.Codec<any, StoredOf<S>, any, any>>
  | Expr<StoredOf<S>>
  | (boolean extends StoredOf<S> ? Predicate : never)
  | StoredOf<S>

/** What `definedAs` is handed for one argument: the argument as an expression. */
export type ParameterOf<S extends Schema.Top> =
  | Expr<StoredOf<S>>
  | (boolean extends StoredOf<S> ? Predicate : never)

/** A call: a predicate for a boolean result, an expression of its stored output otherwise. */
type CallOf<Out extends Schema.Top> = [StoredOf<Out>] extends [boolean]
  ? Predicate
  : Expr<StoredOf<Out>>

/**
 * An operator: called like a function, it builds the expression the call
 * means. See `Expr.operator`.
 */
export interface Operator<In extends ReadonlyArray<Schema.Top>, Out extends Schema.Top> {
  <const A extends { readonly [K in keyof In]: ArgumentOf<In[K]> }>(
    ...args: A
  ): CallOf<Out> & Reads<ReadsOf<A[number]>>
  /**
   * A call comparing text under the collation given, rather than its text
   * arguments' declared one: for an operator whose `collation` is `operands`
   * or `required`, as `Expr.lt(field, value, { collation })` is.
   */
  <const A extends { readonly [K in keyof In]: ArgumentOf<In[K]> }>(
    ...args: [...A, CallOptions]
  ): CallOf<Out> & Reads<ReadsOf<A[number]>>
  /**
   * The call without its first argument, for `pipe` and `flow`:
   * `pipe(Product.fields.upc, startsWith.step('A'))` builds what
   * `startsWith(Product.fields.upc, 'A')` builds. It takes no `CallOptions`; a
   * call that needs a collation is written data-first.
   */
  readonly step: OperatorStep<In, Out>
  readonly descriptor: OperatorDescriptor
}

type OperatorArguments<In extends ReadonlyArray<Schema.Top>> = {
  readonly [K in keyof In]: ArgumentOf<In[K]>
}

/** An operator's step: its arguments past the first, then the first. */
export type OperatorStep<In extends ReadonlyArray<Schema.Top>, Out extends Schema.Top> = <
  const Rest extends (OperatorArguments<In> extends readonly [unknown, ...infer R]
    ? Readonly<R>
    : never),
>(
  ...rest: Rest
) => <
  const Self extends (OperatorArguments<In> extends readonly [infer First, ...Array<unknown>]
    ? First
    : never),
>(
  self: Self,
) => CallOf<Out> & Reads<ReadsOf<Self> | ReadsOf<Rest[number]>>

/** What a call may say past its arguments. */
export interface CallOptions {
  /** The collation it compares text under, in place of its arguments' declared one. */
  readonly collation: Collation
}

const collationTags = new Set(['Binary', 'AsciiFold', 'Locale'])

/** A call's last value, when it is one past the arguments: its options, checked. */
const callOptionsOf = (id: string, value: unknown): Collation => {
  const collation =
    typeof value === 'object' && value !== null && Object.hasOwn(value, 'collation')
      ? (value as { readonly collation: { readonly _tag?: unknown } }).collation
      : undefined
  if (!collationTags.has(String(collation?._tag))) {
    throw new Error(
      `[foldkit-entity] ${id}: a value past its arguments is \`{ collation }\`, a Collation`,
    )
  }
  return collation as Collation
}

/** A collation a call was given: one its operator compares by, and portable where required. */
const givenCollation = (
  id: string,
  descriptor: OperatorDescriptor,
  collation: Collation,
): Option.Option<Collation> => {
  if (Option.isSome(descriptor.definedAs) || descriptor.collation === 'none') {
    throw new Error(`[foldkit-entity] ${id}: takes no collation; it compares no text of its own`)
  }
  // No call carries a locale: the client could not run it, and SQL compiles none.
  if (collation._tag === 'Locale') {
    throw new Error(
      `[foldkit-entity] ${id}: compares by the backend's "${collation.locale}" collation, which only that backend has`,
    )
  }
  return Option.some(collation)
}

/** Namespaced, lower camel case: `cms.published`, `text.startsWith`. */
const operatorId = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/

/** One argument, checked against the schema it is passed for, as a node. */
const argumentFor = (id: string, position: number, schema: Schema.Top, value: unknown) => {
  const arg = toNode(value)
  const fail = (what: string) => {
    throw new Error(`[foldkit-entity] ${id}: argument ${position + 1} ${what}`)
  }
  if (Node.$is('Lit')(arg)) {
    if (!Schema.is(Schema.toEncoded(schema))(arg.value)) {
      fail(`is ${JSON.stringify(arg.value)}, which the operator's input schema does not admit`)
    }
    return arg
  }
  const given = kindOf(arg)
  if (given === 'boolean' && Node.$is('Call')(arg)) {
    // As `ArgumentOf` types it: wherever both booleans are stored, null beside them or not.
    const takes = Schema.is(Schema.toEncoded(schema))
    if (!takes(true) || !takes(false)) {
      fail('is a predicate, but the operator does not take a boolean')
    }
    return arg
  }
  const wanted = storedKindOf(schema)
  if (wanted !== 'other' && given !== 'other' && given !== 'null' && given !== wanted) {
    fail(`is stored as ${given}, but the operator takes ${wanted}`)
  }
  return arg
}

/**
 * The collation a primitive call compares text under: the one its collated
 * text arguments share. A literal or an input carries none and does not vote.
 * `required` refuses a call with none, or with a backend's locale.
 */
const callCollation = (
  id: string,
  rule: OperatorDescriptor['collation'],
  args: ReadonlyArray<Node.Node>,
): Option.Option<Collation> => {
  if (rule === 'none') return Option.none()
  const fail = (what: string): never => {
    throw new Error(`[foldkit-entity] ${id}: ${what}`)
  }
  const voters = args.filter(
    arg => !Node.$is('Lit')(arg) && Option.isNone(inputKeyOf(arg)) && kindOf(arg) === 'text',
  )
  const collations = voters.flatMap(arg =>
    Option.match(collationOf(arg), {
      onSome: each => [each],
      onNone: (): ReadonlyArray<Collation> =>
        rule === 'required'
          ? fail(
              `${show(exprOf(arg))} is text with no declared collation, so backends would compare it differently; declare Collation.binary or Collation.asciiFold on it`,
            )
          : [],
    }),
  )
  const [shared] = collations
  if (shared === undefined) {
    return rule === 'required'
      ? fail('compares text with no field or call holding a collation')
      : Option.none()
  }
  if (collations.some(each => each._tag !== shared._tag)) {
    fail(`${voters.map(voter => show(exprOf(voter))).join(' and ')} declare different collations`)
  }
  if (shared._tag === 'Locale') {
    fail(`compares by the backend's "${shared.locale}" collation, which a call cannot carry`)
  }
  return Option.some(shared)
}

/** A node equal to `node` and not it, so it can carry an origin of its own. */
const fresh = (node: Node.Node): Node.Node =>
  Node.$match(node, {
    Lit: ({ value }) => Node.Lit({ value }),
    Path: ({ segments, ast }) => Node.Path({ segments, ast }),
    Call: ({ op, args }) => Node.Call({ op, args }),
    If: ({ cond, then, otherwise }) => Node.If({ cond, then, otherwise }),
    Match: ({ on, cases, otherwise }) => Node.Match({ on, cases, otherwise }),
    Opaque: ({ name, reads, run }) => Node.Opaque({ name, reads, run }),
    Rows: ({ fold, over, where, value, set, op }) =>
      Node.Rows({ fold, over, where, value, set, ...(op === undefined ? {} : { op }) }),
  })

/** What `makeOperator` takes: `Expr.operator`'s options, and how the kernel builds its own. */
interface OperatorOptions {
  readonly input: ReadonlyArray<Schema.Top>
  readonly output: Schema.Top
  readonly version?: number | undefined
  readonly description?: string | undefined
  readonly definedAs?: ((...args: ReadonlyArray<AnyExpr>) => unknown) | undefined
  readonly nulls?: OperatorDescriptor['nulls'] | undefined
  readonly collation?: OperatorDescriptor['collation'] | undefined
  readonly claims?: Node.ForeignClaims | undefined
}

/** Builds an operator: checks what it is given once, then each call. */
export const makeOperator = (
  id: string,
  options: OperatorOptions,
  build?: KernelBuild,
): Operator<ReadonlyArray<Schema.Top>, Schema.Top> => {
  const fail = (what: string): never => {
    throw new Error(`[foldkit-entity] Expr.operator("${id}"): ${what}`)
  }
  if (!operatorId.test(id)) {
    fail('an id is namespaced lower camel case, as `cms.published`')
  }
  if (id.startsWith('foldkit.')) fail('ids under `foldkit.` are reserved')
  const version = options.version ?? 1
  if (!Number.isSafeInteger(version) || version < 1) fail('a version is a positive integer')
  if (!Array.isArray(options.input) || !options.input.every(Schema.isSchema)) {
    fail('`input` is one schema per argument')
  }
  if (!Schema.isSchema(options.output)) fail('`output` is a schema')
  const definedAs = Option.fromUndefinedOr(options.definedAs)
  if (Option.isSome(definedAs) && typeof definedAs.value !== 'function') {
    fail('`definedAs` builds what a call means')
  }
  // A defined operator means its body, null and text alike: it declares neither.
  if (
    Option.isSome(definedAs) &&
    (options.nulls !== undefined || options.collation !== undefined)
  ) {
    fail("a defined operator means its body, so `nulls` and `collation` are its body's")
  }
  if (Option.isSome(definedAs) && options.claims !== undefined) {
    fail("a defined operator is its body, and readers read the body's operations; remove claims.")
  }
  if (build === undefined && Option.isNone(definedAs)) {
    const reserved = Node.RESERVED_PREFIXES.find(prefix => id.startsWith(prefix))
    if (reserved !== undefined) {
      fail(`ids under \`${reserved}\` are reserved for core operations`)
    }
  }
  const nulls = options.nulls ?? 'strict'
  const collation = options.collation ?? 'none'
  if (nulls !== 'strict' && nulls !== 'own') fail("`nulls` is 'strict' or 'own'")
  if (collation !== 'none' && collation !== 'operands' && collation !== 'required') {
    fail("`collation` is 'none', 'operands' or 'required'")
  }
  const input = Object.freeze([...options.input])
  const predicate = SchemaAST.isBoolean(Schema.toEncoded(options.output).ast)
  if (collation === 'operands' && storedKindOf(options.output) !== 'text') {
    fail("`collation: 'operands'` describes a text result, and this one is not text")
  }
  const claims: Node.ForeignClaims = Object.freeze({ ...(options.claims ?? {}) })
  const descriptor: OperatorDescriptor = Object.freeze({
    _tag: 'Operator',
    id,
    version,
    description: Option.fromUndefinedOr(options.description),
    input,
    output: options.output,
    definedAs,
    nulls,
    collation,
    claims,
  })
  if (build !== undefined) kernel(descriptor, build)
  /** A defined call's expansion, checked: of its output's kind, reading only its arguments. */
  const expand = (
    body: (...args: ReadonlyArray<AnyExpr>) => unknown,
    args: ReadonlyArray<Node.Node>,
  ): Node.Node => {
    const expansion = toNode(body(...args.map(arg => exprOf(arg))))
    if (predicate !== (kindOf(expansion) === 'boolean')) {
      throw new Error(
        `[foldkit-entity] ${id}: its output is ${predicate ? 'a boolean, so `definedAs` returns a predicate' : 'not a boolean, so `definedAs` returns a scalar'}`,
      )
    }
    // An expansion reading what its arguments do not would hide a read from
    // anyone asking what the call depends on: Guard's checks, Remote's matching.
    const allowed = readKeys(args)
    const hidden = [...readKeys([expansion])].filter(key => !allowed.has(key))
    if (hidden.length > 0) {
      throw new Error(
        `[foldkit-entity] ${id}: \`definedAs\` reads ${hidden.join(', ')}, which no argument holds; pass it as one`,
      )
    }
    return expansion
  }
  const call = (...written: ReadonlyArray<unknown>) => {
    // One value past the arguments is the call's options.
    const explicit =
      written.length === input.length + 1
        ? Option.some(callOptionsOf(id, written[written.length - 1]))
        : Option.none<Collation>()
    const given = Option.isSome(explicit) ? written.slice(0, -1) : written
    if (given.length !== input.length) {
      throw new Error(
        `[foldkit-entity] ${id}: takes ${input.length} argument${input.length === 1 ? '' : 's'}, given ${given.length}`,
      )
    }
    const args = Object.freeze(
      given.map((value, position) => argumentFor(id, position, input[position]!, value)),
    )
    const carried = Option.map(explicit, each => givenCollation(id, descriptor, each))
    return Option.match(descriptor.definedAs, {
      // What it means, as a node of its own, so the call's name is kept beside it.
      onSome: body => {
        const expansion = expand(body, args)
        return exprOf(
          made(fresh(expansion), {
            _tag: 'Call',
            operator: descriptor,
            args,
            collation: Option.flatten(carried).pipe(
              Option.orElse(() => (predicate ? Option.none() : collationOf(expansion))),
            ),
            expansion: Option.some(expansion),
          }),
        )
      },
      onNone: () => {
        const collated = Option.match(carried, {
          onSome: each => each,
          onNone: () => callCollation(id, collation, args),
        })
        return exprOf(
          made(callOperator(descriptor, args, collated), {
            _tag: 'Call',
            operator: descriptor,
            args,
            collation: collated,
            expansion: Option.none(),
          }),
        )
      },
    })
  }
  const step =
    (...rest: ReadonlyArray<unknown>) =>
    (self: unknown) =>
      call(self, ...rest)
  return Object.freeze(Object.assign(call, { step, descriptor })) as unknown as Operator<
    ReadonlyArray<Schema.Top>,
    Schema.Top
  >
}

const adaptClaims = (claims: Node.ForeignClaims): Record<string, unknown> => {
  const inverse = claims.invertible?.inverse
  if (inverse === undefined || inverse === 'self') return claims as Record<string, unknown>
  return {
    ...claims,
    invertible: { inverse: 'descriptor' in inverse ? inverse : { descriptor: inverse } },
  }
}

/**
 * An operator, defined by what a call of it means: `definedAs` builds that
 * expression from the call's arguments, once per call, and every interpreter
 * runs it, so the operator needs no implementation anywhere. What it adds is
 * a name: a query, a guard and an invariant that mean the same thing say so,
 * and print it.
 *
 * ```ts
 * const published = Expr.operator('cms.published', {
 *   input: [Schema.Unknown],
 *   output: Schema.Boolean,
 *   definedAs: publishedAt => Expr.isNotNull(publishedAt),
 * })
 * Query.where(published(Post.fields.publishedAt))
 * ```
 *
 * Arguments are checked by their stored form: a field, expression or plain
 * value of the input's stored type, or a predicate where it takes a boolean.
 * A boolean output makes a call a predicate. `definedAs` may read only what
 * its arguments hold: a field or input it closes over instead is refused when
 * called, since nothing asking what the call reads would see it. The id is
 * namespaced (`cms.published`); `foldkit.` is reserved; `version` (default 1)
 * changes when what it means does.
 *
 * **Without `definedAs` it is primitive**: each interpreter implements it
 * (`Operators.implement` in memory), and one without an implementation
 * refuses the body by the operator's id. `nulls` (default `strict`: a null
 * argument gives null, the implementation never sees one) and `collation`
 * (`operands`: a text result carries its text arguments' shared collation;
 * `required`: it compares text itself and needs one) are a primitive
 * operator's; a defined one means its body for both.
 */
export const operator = <const In extends ReadonlyArray<Schema.Top>, Out extends Schema.Top>(
  id: string,
  options: {
    readonly input: In
    readonly output: Out
    readonly version?: number | undefined
    readonly description?: string | undefined
  } & (
    | {
        readonly definedAs: (
          ...args: { readonly [K in keyof In]: ParameterOf<In[K]> }
        ) => [StoredOf<Out>] extends [boolean] ? Predicate : Expr<StoredOf<Out>>
        readonly nulls?: undefined
        readonly collation?: undefined
        readonly claims?: undefined
      }
    | {
        readonly definedAs?: undefined
        readonly nulls?: OperatorDescriptor['nulls'] | undefined
        readonly collation?: OperatorDescriptor['collation'] | undefined
        /** Algebraic claims every implementation keeps (`@doeixd/metakit/operation`), checked by `checkOperation`. */
        readonly claims?: Node.ForeignClaims | undefined
      }
  ),
): Operator<In, Out> => {
  const made = makeOperator(id, options as OperatorOptions) as unknown as Operator<In, Out>
  const descriptor = made.descriptor
  if (Option.isNone(descriptor.definedAs)) {
    registerForeign(
      descriptor,
      () =>
        Operation.define({
          id: descriptor.id,
          version: descriptor.version,
          args: descriptor.input.map(schema => Schema.toEncoded(schema)),
          returns: Schema.toEncoded(descriptor.output),
          nulls: descriptor.nulls,
          claims: adaptClaims(descriptor.claims),
        } as Parameters<typeof Operation.define>[0]).descriptor,
    )
  }
  return made
}
