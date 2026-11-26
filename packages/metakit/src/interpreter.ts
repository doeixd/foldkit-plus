/**
 * Effect-native Interpreter service and composable middleware layers
 * (`metakit/interpreter`).
 *
 * Provides `Interpreter` as an Effect `Context.Reference` (defaulting to the
 * in-memory evaluator, mirroring `Solver` in `metakit/prove`), so applications
 * supply foreign operations (`Operation.define`), tracing spans, audit
 * observers, or foreign-op allowlists once via Effect `Layer`s instead of
 * threading `{ foreign }` options through every call site.
 */
import { Clock, Context, Effect, Exit, Layer, Result } from 'effect'
import * as Expr from './expr.js'
import type * as Fn from './fn.js'
import type * as Node from './node.js'
import type * as Policy from './policy.js'
import * as Transition from './transition.js'
import type * as Verdict from './verdict.js'

/** Structured observation emitted by `withObserver`. */
export type InterpreterEvent =
  | {
      readonly kind: 'eval'
      readonly backend: string
      readonly durationMs: number
      readonly ok: boolean
    }
  | {
      readonly kind: 'judge'
      readonly backend: string
      readonly durationMs: number
      readonly verdict: Verdict.Verdict<never>['_tag']
    }
  | {
      readonly kind: 'residualize'
      readonly backend: string
      readonly durationMs: number
    }
  | {
      readonly kind: 'step'
      readonly backend: string
      readonly durationMs: number
      readonly ok: boolean
    }
  | {
      readonly kind: 'runFn'
      readonly backend: string
      readonly checked: boolean
      readonly durationMs: number
      readonly ok: boolean
    }
  | {
      readonly kind: 'allow'
      readonly backend: string
      readonly rule: string
      readonly durationMs: number
      readonly allowed: boolean
    }

/** Callback invoked by `withObserver` for every interpreter operation. */
export type InterpreterObserver = (event: InterpreterEvent) => Effect.Effect<void>

/** Result of executing one transition step. */
export interface StepOutput<State, Emit> {
  readonly state: State
  readonly emitted: ReadonlyArray<Emit>
}

/** Implementation contract for a MetaKit interpreter backend. */
export interface InterpreterBackend {
  readonly name: string
  /** Foreign operation implementations ambiently available to this backend. */
  readonly foreign: Expr.ForeignImplementations
  /** Evaluate an expression, failing with `Node.Refusal` if evaluation is refused. */
  readonly eval: <Env, A>(
    expr: Expr.Expr<Env, A>,
    env: Env,
  ) => Effect.Effect<A | null, Node.Refusal>
  /** Partially evaluate a boolean expression against a partial environment. */
  readonly judge: <Env>(
    expr: Expr.Expr<Env, boolean>,
    partial: Expr.PartialEnv<Env>,
  ) => Effect.Effect<Verdict.Verdict<never>>
  /** Residualize an expression against a partial environment. */
  readonly residualize: <Env, A>(
    expr: Expr.Expr<Env, A>,
    partial: Expr.PartialEnv<Env>,
  ) => Effect.Effect<Expr.Expr<Env, A>>
  /** Execute a transition (guard + writes + emissions), failing with `Transition.Refused`. */
  readonly step: <State, Input, Emit, Supplied>(
    transition: Transition.Transition<State, Input, Emit, Supplied>,
    state: NoInfer<State>,
    input: NoInfer<Input>,
    ...args: Transition.SuppliedArgs<Supplied>
  ) => Effect.Effect<StepOutput<State, Emit>, Transition.Refused>
  /** Execute a `Fn` (optionally contract-checked via `runChecked`). */
  readonly runFn: <P extends Fn.ParamSchemas, R>(
    fn: Fn.Fn<P, R>,
    args: Fn.ParamValues<P>,
    options?: { readonly checked?: boolean },
  ) => Effect.Effect<R | null, Node.Refusal | Fn.FnContractError>
  /** Evaluate a named `Policy` rule. */
  readonly allow: <
    Row,
    Principal,
    Rules extends Readonly<Record<string, Expr.Expr<Policy.PolicyEnv<Row, Principal>, boolean>>>,
    K extends keyof Rules & string,
  >(
    policy: Policy.Policy<Row, Principal, Rules>,
    rule: K,
    env: NoInfer<Policy.PolicyEnv<Row, Principal>>,
  ) => Effect.Effect<boolean>
}

export interface MemoryBackendOptions {
  readonly name?: string | undefined
  readonly foreign?: Expr.ForeignImplementations | undefined
}

const mergeForeign = (
  base: Expr.ForeignImplementations,
  override: Expr.ForeignImplementations | undefined,
): Expr.ForeignImplementations => (override === undefined ? base : { ...base, ...override })

/** Construct an in-memory `InterpreterBackend` with optional ambient `foreign` implementations. */
export const makeMemoryBackend = (options?: MemoryBackendOptions): InterpreterBackend => {
  const name = options?.name ?? 'memory'
  const foreign: Expr.ForeignImplementations = options?.foreign ?? {}
  const readerOptions: Expr.ReaderOptions = { foreign }

  return {
    name,
    foreign,
    eval: (expr, env) => Effect.fromResult(Expr.evalResult(expr, env, readerOptions)),
    judge: (expr, partial) => Effect.sync(() => Expr.judge(expr, partial, readerOptions)),
    residualize: (expr, partial) =>
      Effect.sync(() => Expr.residualize(expr, partial, readerOptions)),
    step: <State, Input, Emit, Supplied>(
      transition: Transition.Transition<State, Input, Emit, Supplied>,
      state: NoInfer<State>,
      input: NoInfer<Input>,
      ...args: Transition.SuppliedArgs<Supplied>
    ): Effect.Effect<StepOutput<State, Emit>, Transition.Refused> => {
      const [supplied, callerOptions] = args as unknown as readonly [
        Supplied,
        Expr.ReaderOptions | undefined,
      ]
      const mergedOptions: Expr.ReaderOptions = {
        foreign: mergeForeign(foreign, callerOptions?.foreign),
      }
      const callArgs = [supplied, mergedOptions] as unknown as Transition.SuppliedArgs<Supplied>
      return Effect.fromResult(Transition.step(transition, state, input, ...callArgs))
    },
    runFn: (fn, args, opts) =>
      opts?.checked === true
        ? Effect.fromResult(fn.runChecked(args, readerOptions))
        : Effect.fromResult(Expr.evalResult(fn.body, args, readerOptions)),
    allow: (policy, rule, env) =>
      Effect.sync(() => {
        if (!Object.hasOwn(policy.rules, rule)) {
          throw new Error(`[metakit] Policy references unknown rule "${rule}"`)
        }
        return Result.match(Expr.evalResult(policy.rules[rule]!, env, readerOptions), {
          onSuccess: value => value === true,
          onFailure: () => false,
        })
      }),
  }
}

/** Default in-memory backend (no foreign operations registered). */
export const memoryBackend: InterpreterBackend = makeMemoryBackend()

/**
 * The ambient MetaKit interpreter in the Effect context.
 * Defaults to `memoryBackend`; override with `Interpreter.layer(...)` or
 * middleware layers (`withForeign`, `withTracing`, `withObserver`, `withAllowlist`).
 */
export const Interpreter = Context.Reference<InterpreterBackend>('metakit/Interpreter', {
  defaultValue: () => memoryBackend,
})

/** Provide an in-memory `Interpreter` configured with optional `foreign` implementations. */
export const layer = (options?: MemoryBackendOptions): Layer.Layer<never> =>
  Layer.succeed(Interpreter, makeMemoryBackend(options))

/** Merge additional `foreign` operation implementations onto the current `Interpreter`. */
export const withForeign = (foreign: Expr.ForeignImplementations): Layer.Layer<never> =>
  Layer.effect(
    Interpreter,
    Effect.map(Effect.service(Interpreter), current =>
      makeMemoryBackend({
        name: current.name,
        foreign: mergeForeign(current.foreign, foreign),
      }),
    ),
  )

/**
 * Sandbox layer: restricts the current `Interpreter`'s `foreign` implementations
 * to only those whose ids appear in `allowedForeignOps`. Any disallowed foreign
 * op is omitted so evaluation refuses it cleanly with `Node.Refusal`.
 */
export const withAllowlist = (allowedForeignOps: ReadonlySet<string>): Layer.Layer<never> =>
  Layer.effect(
    Interpreter,
    Effect.map(Effect.service(Interpreter), current => {
      const filtered: Record<string, Expr.ForeignImplementation> = {}
      for (const [key, impl] of Object.entries(current.foreign)) {
        const baseId = key.split('@')[0] ?? key
        if (allowedForeignOps.has(key) || allowedForeignOps.has(baseId)) {
          filtered[key] = impl
        }
      }
      return makeMemoryBackend({
        name: `${current.name}:sandbox`,
        foreign: filtered,
      })
    }),
  )

/** Wrap the current `Interpreter` so every operation emits an `Effect.withSpan`. */
export const withTracing = (options?: {
  readonly prefix?: string | undefined
}): Layer.Layer<never> => {
  const prefix = options?.prefix ?? 'metakit.interpreter'
  return Layer.effect(
    Interpreter,
    Effect.map(Effect.service(Interpreter), (inner): InterpreterBackend => ({
      name: inner.name,
      foreign: inner.foreign,
      eval: (expr, env) =>
        inner
          .eval(expr, env)
          .pipe(Effect.withSpan(`${prefix}.eval`, { attributes: { backend: inner.name } })),
      judge: (expr, partial) =>
        inner
          .judge(expr, partial)
          .pipe(Effect.withSpan(`${prefix}.judge`, { attributes: { backend: inner.name } })),
      residualize: (expr, partial) =>
        inner
          .residualize(expr, partial)
          .pipe(Effect.withSpan(`${prefix}.residualize`, { attributes: { backend: inner.name } })),
      step: (transition, state, input, ...args) =>
        inner
          .step(transition, state, input, ...args)
          .pipe(Effect.withSpan(`${prefix}.step`, { attributes: { backend: inner.name } })),
      runFn: (fn, args, opts) =>
        inner.runFn(fn, args, opts).pipe(
          Effect.withSpan(`${prefix}.runFn`, {
            attributes: { backend: inner.name, checked: opts?.checked === true },
          }),
        ),
      allow: (policy, rule, env) =>
        inner.allow(policy, rule, env).pipe(
          Effect.withSpan(`${prefix}.allow`, {
            attributes: { backend: inner.name, rule },
          }),
        ),
    })),
  )
}

/**
 * Middleware layer that notifies `observer` after every interpreter operation,
 * measuring elapsed duration using Effect's `Clock`.
 */
export const withObserver = (observer: InterpreterObserver): Layer.Layer<never> =>
  Layer.effect(
    Interpreter,
    Effect.map(Effect.service(Interpreter), (inner): InterpreterBackend => ({
      name: inner.name,
      foreign: inner.foreign,
      eval: (expr, env) =>
        Effect.gen(function* () {
          const start = yield* Clock.currentTimeMillis
          const exit = yield* Effect.exit(inner.eval(expr, env))
          const end = yield* Clock.currentTimeMillis
          yield* observer({
            kind: 'eval',
            backend: inner.name,
            durationMs: end - start,
            ok: Exit.isSuccess(exit),
          })
          return yield* exit
        }),
      judge: (expr, partial) =>
        Effect.gen(function* () {
          const start = yield* Clock.currentTimeMillis
          const verdict = yield* inner.judge(expr, partial)
          const end = yield* Clock.currentTimeMillis
          yield* observer({
            kind: 'judge',
            backend: inner.name,
            durationMs: end - start,
            verdict: verdict._tag,
          })
          return verdict
        }),
      residualize: (expr, partial) =>
        Effect.gen(function* () {
          const start = yield* Clock.currentTimeMillis
          const out = yield* inner.residualize(expr, partial)
          const end = yield* Clock.currentTimeMillis
          yield* observer({
            kind: 'residualize',
            backend: inner.name,
            durationMs: end - start,
          })
          return out
        }),
      step: (transition, state, input, ...args) =>
        Effect.gen(function* () {
          const start = yield* Clock.currentTimeMillis
          const exit = yield* Effect.exit(inner.step(transition, state, input, ...args))
          const end = yield* Clock.currentTimeMillis
          yield* observer({
            kind: 'step',
            backend: inner.name,
            durationMs: end - start,
            ok: Exit.isSuccess(exit),
          })
          return yield* exit
        }),
      runFn: (fn, args, opts) =>
        Effect.gen(function* () {
          const start = yield* Clock.currentTimeMillis
          const exit = yield* Effect.exit(inner.runFn(fn, args, opts))
          const end = yield* Clock.currentTimeMillis
          yield* observer({
            kind: 'runFn',
            backend: inner.name,
            checked: opts?.checked === true,
            durationMs: end - start,
            ok: Exit.isSuccess(exit),
          })
          return yield* exit
        }),
      allow: (policy, rule, env) =>
        Effect.gen(function* () {
          const start = yield* Clock.currentTimeMillis
          const allowed = yield* inner.allow(policy, rule, env)
          const end = yield* Clock.currentTimeMillis
          yield* observer({
            kind: 'allow',
            backend: inner.name,
            rule,
            durationMs: end - start,
            allowed,
          })
          return allowed
        }),
    })),
  )

// ---------------------------------------------------------------------------
// Ambient helpers reading the current `Interpreter` from Effect context
// ---------------------------------------------------------------------------

/** Read the foreign operation implementations registered on the current `Interpreter`. */
export const foreign: Effect.Effect<Expr.ForeignImplementations> = Effect.map(
  Effect.service(Interpreter),
  i => i.foreign,
)

/** Evaluate `expr` against `env` using the current `Interpreter`. */
export const evalExpr = <Env, A>(
  expr: Expr.Expr<Env, A>,
  env: Env,
): Effect.Effect<A | null, Node.Refusal> =>
  Effect.flatMap(Effect.service(Interpreter), i => i.eval(expr, env))

/** Partially evaluate boolean `expr` against `partial` using the current `Interpreter`. */
export const judge = <Env>(
  expr: Expr.Expr<Env, boolean>,
  partial: Expr.PartialEnv<Env>,
): Effect.Effect<Verdict.Verdict<never>> =>
  Effect.flatMap(Effect.service(Interpreter), i => i.judge(expr, partial))

/** Residualize `expr` against `partial` using the current `Interpreter`. */
export const residualize = <Env, A>(
  expr: Expr.Expr<Env, A>,
  partial: Expr.PartialEnv<Env>,
): Effect.Effect<Expr.Expr<Env, A>> =>
  Effect.flatMap(Effect.service(Interpreter), i => i.residualize(expr, partial))

/** Execute a transition step (returning `{ state, emitted }`) using the current `Interpreter`. */
export const step = <State, Input, Emit, Supplied>(
  transition: Transition.Transition<State, Input, Emit, Supplied>,
  state: NoInfer<State>,
  input: NoInfer<Input>,
  ...args: Transition.SuppliedArgs<Supplied>
): Effect.Effect<StepOutput<State, Emit>, Transition.Refused> =>
  Effect.flatMap(Effect.service(Interpreter), i => i.step(transition, state, input, ...args))

/** Execute a transition (returning the next `State`) using the current `Interpreter`. */
export const run = <State, Input, Emit, Supplied>(
  transition: Transition.Transition<State, Input, Emit, Supplied>,
  state: NoInfer<State>,
  input: NoInfer<Input>,
  ...args: Transition.SuppliedArgs<Supplied>
): Effect.Effect<State, Transition.Refused> =>
  Effect.map(step(transition, state, input, ...args), s => s.state)

/** Execute a `Fn` using the current `Interpreter`. */
export const runFn = <P extends Fn.ParamSchemas, R>(
  fn: Fn.Fn<P, R>,
  args: Fn.ParamValues<P>,
  options?: { readonly checked?: boolean },
): Effect.Effect<R | null, Node.Refusal | Fn.FnContractError> =>
  Effect.flatMap(Effect.service(Interpreter), i => i.runFn(fn, args, options))

/** Evaluate a named `Policy` rule using the current `Interpreter`. */
export const allow = <
  Row,
  Principal,
  Rules extends Readonly<Record<string, Expr.Expr<Policy.PolicyEnv<Row, Principal>, boolean>>>,
  K extends keyof Rules & string,
>(
  policy: Policy.Policy<Row, Principal, Rules>,
  rule: K,
  env: NoInfer<Policy.PolicyEnv<Row, Principal>>,
): Effect.Effect<boolean> =>
  Effect.flatMap(Effect.service(Interpreter), i => i.allow(policy, rule, env))
