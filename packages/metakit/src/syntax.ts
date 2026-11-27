/**
 * MetaKit DSL authoring toolkit (`metakit/syntax`, #647 P0/P1).
 *
 * Small, orthogonal combinators over the existing MetaKit kernel:
 * - `dual` — data-first / data-last overloads from an `Operation` with an
 *   explicit receiver position (`self: 0 | 1`), preserving operand order,
 *   environment intersection, and null propagation.
 * - `dualLanguage` — derives a dual/pipeable namespace for every operation in
 *   a `Language` without mutating `Expr` prototypes.
 * - `grammar` — lightweight type-state builder combinator with compile-time
 *   stage/context enforcement AND derived runtime sequence validation.
 * - `testLanguage` — shared conformance harness running reference JS,
 *   `metakit/artifact` round-trip, fingerprinting, and `Language.readiness`
 *   checks (distinguishing bounded `tested` results from formal proofs).
 */
import { Effect, Result, Schema } from 'effect'
import * as Artifact from './artifact.js'
import * as Expr from './expr.js'
import * as Language from './language.js'
import type { AnyOperation, EnvOfAll, NullOfAll, Operation } from './operation.js'
import type { OperationImplementations } from './operation.js'
import type { ForeignLowerings, SqlDialect } from './operationSql.js'
import type { ExprInput } from './ops/core.js'
import type { Expr as ExprType } from './path.js'

// ---------------------------------------------------------------------------
// 1. Safe dual (data-first / data-last) with explicit receiver position
// ---------------------------------------------------------------------------

type OpArgInput<S extends Schema.Top> = ExprInput<never, Schema.Schema.Type<S> | null>

type OpResult<
  Args extends ReadonlyArray<unknown>,
  R extends Schema.Top,
  N extends 'strict' | 'own',
> = ExprType<
  EnvOfAll<Args>,
  N extends 'strict' ? Schema.Schema.Type<R> | NullOfAll<Args> : Schema.Schema.Type<R> | null
>

/** Dual callable for a binary `Operation` with `self` at index 0: `op(a, b)` or `pipe(a, op(b))`. */
export interface DualBinary0<
  A extends Schema.Top,
  B extends Schema.Top,
  R extends Schema.Top,
  N extends 'strict' | 'own',
> {
  <const X extends OpArgInput<A>, const Y extends OpArgInput<B>>(
    self: X,
    other: Y,
  ): OpResult<readonly [X, Y], R, N>
  <const Y extends OpArgInput<B>>(
    other: Y,
  ): <const X extends OpArgInput<A>>(self: X) => OpResult<readonly [X, Y], R, N>
}

/** Dual callable for a binary `Operation` with `self` at index 1: `op(a, b)` or `pipe(b, op(a))`. */
export interface DualBinary1<
  A extends Schema.Top,
  B extends Schema.Top,
  R extends Schema.Top,
  N extends 'strict' | 'own',
> {
  <const X extends OpArgInput<A>, const Y extends OpArgInput<B>>(
    first: X,
    self: Y,
  ): OpResult<readonly [X, Y], R, N>
  <const X extends OpArgInput<A>>(
    first: X,
  ): <const Y extends OpArgInput<B>>(self: Y) => OpResult<readonly [X, Y], R, N>
}

/** Dual callable for a ternary `Operation` with `self` at index 0: `op(a, b, c)` or `pipe(a, op(b, c))`. */
export interface DualTernary0<
  A extends Schema.Top,
  B extends Schema.Top,
  C extends Schema.Top,
  R extends Schema.Top,
  N extends 'strict' | 'own',
> {
  <const X extends OpArgInput<A>, const Y extends OpArgInput<B>, const Z extends OpArgInput<C>>(
    self: X,
    second: Y,
    third: Z,
  ): OpResult<readonly [X, Y, Z], R, N>
  <const Y extends OpArgInput<B>, const Z extends OpArgInput<C>>(
    second: Y,
    third: Z,
  ): <const X extends OpArgInput<A>>(self: X) => OpResult<readonly [X, Y, Z], R, N>
}

/**
 * Derive a data-first / data-last callable from an `Operation` with an explicit
 * receiver position (`self: 0` or `self: 1`). Never silently swaps operands
 * of non-commutative operations.
 */
export function dual<
  Id extends string,
  V extends number,
  A extends Schema.Top,
  B extends Schema.Top,
  R extends Schema.Top,
  N extends 'strict' | 'own',
  C extends object,
>(
  op: Operation<Id, V, readonly [A, B], R, N, C>,
  options?: { readonly self?: 0 },
): DualBinary0<A, B, R, N>
export function dual<
  Id extends string,
  V extends number,
  A extends Schema.Top,
  B extends Schema.Top,
  R extends Schema.Top,
  N extends 'strict' | 'own',
  C extends object,
>(
  op: Operation<Id, V, readonly [A, B], R, N, C>,
  options: { readonly self: 1 },
): DualBinary1<A, B, R, N>
export function dual<
  Id extends string,
  V extends number,
  A extends Schema.Top,
  B extends Schema.Top,
  CArg extends Schema.Top,
  R extends Schema.Top,
  N extends 'strict' | 'own',
  C extends object,
>(
  op: Operation<Id, V, readonly [A, B, CArg], R, N, C>,
  options?: { readonly self?: 0 },
): DualTernary0<A, B, CArg, R, N>
export function dual(
  op: AnyOperation & ((...args: ReadonlyArray<unknown>) => unknown),
  options?: { readonly self?: number },
): (...args: ReadonlyArray<unknown>) => unknown {
  const arity = op.descriptor.args.length
  const selfPos = options?.self ?? 0
  if (!Number.isInteger(selfPos) || selfPos < 0 || selfPos >= arity) {
    throw new RangeError(
      `[metakit/syntax] dual("${op.descriptor.id}"): self position ${selfPos} out of range for arity ${arity}`,
    )
  }
  return (...args: ReadonlyArray<unknown>): unknown => {
    if (args.length === arity) return op(...args)
    if (args.length === arity - 1) {
      return (self: unknown) => {
        const full = [...args.slice(0, selfPos), self, ...args.slice(selfPos)]
        return op(...full)
      }
    }
    throw new RangeError(
      `[metakit/syntax] dual("${op.descriptor.id}"): expected ${arity} (data-first) or ${arity - 1} (data-last) argument(s), got ${args.length}`,
    )
  }
}

const RESERVED_PROPS = new Set([
  'then',
  'pipe',
  'constructor',
  'toString',
  'toJSON',
  'valueOf',
  '__proto__',
])

type DualOfOp<O> =
  O extends Operation<
    string,
    number,
    readonly [infer A extends Schema.Top, infer B extends Schema.Top],
    infer R extends Schema.Top,
    infer N extends 'strict' | 'own',
    object
  >
    ? DualBinary0<A, B, R, N>
    : O extends Operation<
          string,
          number,
          readonly [
            infer A extends Schema.Top,
            infer B extends Schema.Top,
            infer C extends Schema.Top,
          ],
          infer R extends Schema.Top,
          infer N extends 'strict' | 'own',
          object
        >
      ? DualTernary0<A, B, C, R, N>
      : O

type FamilyMap = Readonly<Record<string, Readonly<Record<string, AnyOperation>>>>

export type DualFamilies<F extends FamilyMap> = {
  readonly [Family in keyof F]: {
    readonly [Op in keyof F[Family]]: DualOfOp<F[Family][Op]>
  }
}

/**
 * Derive a dual/pipeable namespace (`self: 0`) for every operation in `language`.
 * Rejects reserved JS property names (`then`, `pipe`, `constructor`, …) loudly.
 */
export const dualLanguage = <F extends FamilyMap>(
  language: Language.Language<F>,
): DualFamilies<F> => {
  const out: Record<string, Record<string, unknown>> = {}
  for (const familyName of Object.keys(language.families)) {
    if (RESERVED_PROPS.has(familyName)) {
      throw new Error(`[metakit/syntax] dualLanguage: reserved family name "${familyName}"`)
    }
    const family = language.families[familyName]!
    const dualFamily: Record<string, unknown> = {}
    for (const opName of Object.keys(family)) {
      if (RESERVED_PROPS.has(opName)) {
        throw new Error(
          `[metakit/syntax] dualLanguage: reserved operation name "${familyName}.${opName}"`,
        )
      }
      const op = family[opName]! as AnyOperation & ((...args: ReadonlyArray<unknown>) => unknown)
      const arity = op.descriptor.args.length
      dualFamily[opName] = arity === 2 || arity === 3 ? dual(op as never) : op
    }
    out[familyName] = dualFamily
  }
  return out as DualFamilies<F>
}

// ---------------------------------------------------------------------------
// 2. Typed state-machine grammar + derived runtime sequence validator
// ---------------------------------------------------------------------------

export type GrammarSpec<States extends string> = {
  readonly [S in States]: Readonly<Record<string, States>>
}

/** Invalid transition sequence reported by `grammar.validate`. */
export class GrammarViolationError extends Schema.TaggedError<GrammarViolationError>()(
  'GrammarViolationError',
  {
    stepIndex: Schema.Int,
    state: Schema.String,
    transition: Schema.String,
    allowed: Schema.Array(Schema.String),
  },
) {}

/** Immutable builder token carrying its current grammar state, history, and typed context. */
export interface Staged<State extends string, Ctx> {
  readonly state: State
  readonly context: Ctx
  readonly steps: ReadonlyArray<string>
}

export interface Grammar<
  States extends string,
  Initial extends States,
  Spec extends GrammarSpec<States>,
> {
  readonly initial: Initial
  readonly spec: Spec
  /** Start a staged builder in the initial state with typed context `context`. */
  readonly start: <Ctx>(context: Ctx) => Staged<Initial, Ctx>
  /**
   * Apply a transition allowed from `current.state`, transforming the typed
   * context and advancing the compile-time state to `Spec[State][K]`.
   */
  readonly step: <State extends States, K extends keyof Spec[State] & string, Ctx, NextCtx>(
    current: Staged<State, Ctx>,
    transition: K,
    update: (ctx: Ctx) => NextCtx,
  ) => Staged<Spec[State][K], NextCtx>
  /**
   * Runtime validator for externally decoded or dynamic step sequences.
   * Returns the terminal state or fails with `GrammarViolationError`.
   */
  readonly validate: (
    steps: ReadonlyArray<string>,
    requiredTerminal?: ReadonlyArray<States>,
  ) => Effect.Effect<States, GrammarViolationError>
}

/**
 * Define a typed staged-construction grammar with both compile-time state
 * transitions and a derived runtime validator (`validate`).
 */
export const grammar = <
  const States extends string,
  const Initial extends States,
  const Spec extends GrammarSpec<States>,
>(
  initial: Initial,
  spec: Spec,
): Grammar<States, Initial, Spec> => {
  if (RESERVED_PROPS.has(initial) || !Object.hasOwn(spec, initial)) {
    throw new Error(
      `[metakit/syntax] grammar: initial state "${initial}" is not an own state in spec`,
    )
  }
  for (const stateName of Object.keys(spec)) {
    if (RESERVED_PROPS.has(stateName)) {
      throw new Error(`[metakit/syntax] grammar: reserved state name "${stateName}"`)
    }
    const transitions = spec[stateName as States]
    for (const transitionName of Object.keys(transitions)) {
      if (RESERVED_PROPS.has(transitionName)) {
        throw new Error(
          `[metakit/syntax] grammar: reserved transition name "${stateName}.${transitionName}"`,
        )
      }
      const target = transitions[transitionName]!
      if (!Object.hasOwn(spec, target)) {
        throw new Error(
          `[metakit/syntax] grammar: transition "${stateName}.${transitionName}" points to unknown state "${target}"`,
        )
      }
    }
  }
  return {
    initial,
    spec,
    start: context => ({ state: initial, context, steps: [] }),
    step: (current, transition, update) => {
      const allowed = Object.hasOwn(spec, current.state) ? spec[current.state] : undefined
      if (allowed === undefined || !Object.hasOwn(allowed, transition)) {
        throw new Error(
          `[metakit/syntax] grammar: transition "${transition}" is not allowed in state "${current.state}"`,
        )
      }
      const nextState = allowed[transition]!
      return {
        state: nextState,
        context: update(current.context),
        steps: [...current.steps, transition],
      }
    },
    validate: (steps, requiredTerminal) =>
      Effect.suspend(() => {
        let current: States = initial
        for (let i = 0; i < steps.length; i++) {
          const transition = steps[i]!
          const allowed = Object.hasOwn(spec, current) ? spec[current] : undefined
          if (allowed === undefined || !Object.hasOwn(allowed, transition)) {
            return Effect.fail(
              new GrammarViolationError({
                stepIndex: i,
                state: current,
                transition,
                allowed: allowed === undefined ? [] : Object.keys(allowed).sort(),
              }),
            )
          }
          current = allowed[transition]!
        }
        if (requiredTerminal !== undefined && !requiredTerminal.includes(current)) {
          return Effect.fail(
            new GrammarViolationError({
              stepIndex: steps.length,
              state: current,
              transition: '<end>',
              allowed: [...requiredTerminal],
            }),
          )
        }
        return Effect.succeed(current)
      }),
  }
}

// ---------------------------------------------------------------------------
// 3. Shared DSL TestKit (bounded testing, distinct from formal proof)
// ---------------------------------------------------------------------------

export interface LanguageTestCase<
  Shape extends Readonly<Record<string, Schema.Top>>,
  R extends Schema.Top,
> {
  readonly name: string
  readonly env: Shape
  readonly result: R
  readonly expr: ExprType<{ readonly [K in keyof Shape]: Shape[K]['Type'] }, R['Type']>
  readonly samples: ReadonlyArray<{ readonly [K in keyof Shape]: Shape[K]['Type'] }>
}

/** Type-erased test case accepted by `testLanguage` after `testCase(...)` checks its types. */
export interface AnyLanguageTestCase {
  readonly name: string
  readonly env: Readonly<Record<string, Schema.Top>>
  readonly result: Schema.Top
  readonly expr: ExprType<never, unknown>
  readonly samples: ReadonlyArray<unknown>
}

/** Construct a type-checked test case for `testLanguage`, preserving exact `env` and `result` inference. */
export const testCase = <
  const Shape extends Readonly<Record<string, Schema.Top>>,
  const R extends Schema.Top,
>(
  spec: LanguageTestCase<Shape, R>,
): AnyLanguageTestCase => spec as unknown as AnyLanguageTestCase

export interface LanguageCaseReport {
  readonly name: string
  /** Explicitly marked `tested` (bounded differential check), never `proven`. */
  readonly evidence: 'tested'
  readonly fingerprint: Artifact.ArtifactFingerprint
  readonly samplesChecked: number
  readonly jsReady: boolean
  readonly sqlReady: Readonly<Partial<Record<SqlDialect, boolean>>>
}

export interface LanguageTestReport {
  readonly cases: ReadonlyArray<LanguageCaseReport>
  readonly passed: boolean
  readonly failures: ReadonlyArray<string>
}

/**
 * Shared conformance harness for any MetaKit `Language`:
 * for every test case, checks `Artifact.encodeExpr`/`decodeExpr` round-trip,
 * deterministic `Artifact.fingerprint`, differential JS evaluation agreement
 * across `samples`, and `Language.readiness` for JS and optional SQL dialects.
 */
export const testLanguage = <F extends FamilyMap>(options: {
  readonly language: Language.Language<F>
  readonly foreign: OperationImplementations
  readonly lowerings?: ForeignLowerings
  readonly dialects?: ReadonlyArray<SqlDialect>
  readonly cases: ReadonlyArray<AnyLanguageTestCase>
}): Effect.Effect<LanguageTestReport, Artifact.ArtifactError> =>
  Effect.gen(function* () {
    const reg = yield* Artifact.registry(options.language)
    const reports: Array<LanguageCaseReport> = []
    const failures: Array<string> = []

    for (const tc of options.cases) {
      const encoded = yield* Artifact.encodeExpr(tc.expr)
      const wire: unknown = JSON.parse(JSON.stringify(encoded))
      const decoded = yield* Artifact.decodeExpr(wire, {
        env: tc.env,
        result: tc.result,
        registry: reg,
      })

      const fpOriginal = yield* Artifact.fingerprint(tc.expr)
      const fpDecoded = yield* Artifact.fingerprint(decoded)
      if (fpOriginal !== fpDecoded) {
        failures.push(`${tc.name}: fingerprint changed after codec round-trip`)
      }

      for (let i = 0; i < tc.samples.length; i++) {
        const sample = tc.samples[i] as never
        const expected = Expr.evalResult(tc.expr, sample, { foreign: options.foreign })
        const actual = Expr.evalResult(decoded, sample, { foreign: options.foreign })
        const same =
          Result.isSuccess(expected) && Result.isSuccess(actual)
            ? Object.is(expected.success, actual.success) ||
              JSON.stringify(expected.success) === JSON.stringify(actual.success)
            : Result.isFailure(expected) && Result.isFailure(actual)
              ? expected.failure.reason === actual.failure.reason &&
                expected.failure.at === actual.failure.at
              : false
        if (!same) {
          failures.push(
            `${tc.name} sample[${i}]: decoded evaluation (${JSON.stringify(actual)}) !== reference (${JSON.stringify(expected)})`,
          )
        }
      }

      const jsReadiness = yield* Language.readiness(tc.expr, {
        _tag: 'js',
        foreign: options.foreign,
      })
      if (!jsReadiness.supported) {
        failures.push(
          `${tc.name}: not JS-ready (${jsReadiness.unsupportedNodes.map(u => u.detail).join('; ')})`,
        )
      }

      const sqlReady: Partial<Record<SqlDialect, boolean>> = {}
      for (const dialect of options.dialects ?? []) {
        const r = yield* Language.readiness(tc.expr, {
          _tag: 'sql',
          dialect,
          ...(options.lowerings === undefined ? {} : { lowerings: options.lowerings }),
        })
        sqlReady[dialect] = r.supported
      }

      reports.push({
        name: tc.name,
        evidence: 'tested',
        fingerprint: fpOriginal,
        samplesChecked: tc.samples.length,
        jsReady: jsReadiness.supported,
        sqlReady,
      })
    }

    return {
      cases: reports,
      passed: failures.length === 0,
      failures,
    }
  })
