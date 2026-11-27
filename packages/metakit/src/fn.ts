/**
 * `metakit/fn`: pure, Schema-typed, callable MetaKit functions with Design-by-Contract
 * preconditions (`where`), return Schemas (`returns`), and postconditions (`ensures`).
 *
 * Calling a `Fn` inside an expression substitutes its argument ASTs directly into
 * `body` (zero new `CoreOpId`s), so SQL, Drizzle, Tier 2 `residualize`, Tier 3 Zone,
 * and Tier 4 Z3 all see straight through it. `Prove.fn` verifies `where => returns && ensures`
 * once in Z3.
 */
import { Data, Option, Pipeable, Result, Schema } from 'effect'
import * as Expr from './expr.js'
import * as Node from './node.js'
import { currentEach } from './ops/arr.js'
import * as Bool from './ops/bool.js'
import { toNode, wrap, type EnvOfInput, type ExprInput } from './ops/core.js'
import { coalesceOp } from './ops/null.js'
import * as Path from './path.js'
import type { Expr as ExprType, PathAccessor, SchemaOf } from './path.js'

/** A record mapping parameter names to Effect Schemas. */
export type ParamSchemas = Readonly<Record<string, SchemaOf>>

/** Runtime value record for parameter schemas `P`. */
export type ParamValues<P extends ParamSchemas> = { readonly [K in keyof P]: P[K]['Type'] }

/** Path accessors passed to `body` and `where` builders. */
export type ParamPaths<P extends ParamSchemas> = {
  readonly [K in keyof P]: PathAccessor<ParamValues<P>, P[K]['Type']>
}

/** Argument inputs accepted when calling a `Fn` symbolically inside an expression. */
export type ArgInputs<P extends ParamSchemas> = {
  readonly [K in keyof P]: ExprInput<never, Path.Read<P[K]['Type']>>
}

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never

/** Merged environment of all symbolic argument expressions passed to a `Fn` call. */
export type MergedArgEnv<Args extends Readonly<Record<string, unknown>>> = [keyof Args] extends [
  never,
]
  ? unknown
  : UnionToIntersection<{ [K in keyof Args]: EnvOfInput<Args[K]> }[keyof Args]>

/** Environment available inside `Fn.ensures`: `{ params, result }`. */
export interface EnsuresEnv<P extends ParamSchemas, R> {
  readonly params: ParamValues<P>
  readonly result: R
}

/** Path accessors passed to `Fn.ensures`. */
export interface EnsuresPaths<P extends ParamSchemas, R> {
  readonly params: PathAccessor<EnsuresEnv<P, R>, ParamValues<P>>
  readonly result: PathAccessor<EnsuresEnv<P, R>, R>
}

/**
 * Underlying carrier type accepted when a body or argument feeds a declared
 * Schema type `R`:
 * - Rejects disjoint types (`number` vs `string`) and silent `null` stripping
 *   (`number | null` cannot satisfy `number`).
 * - Rejects widening arbitrary `string`/`number` into literal unions (`'a' | 'b'`).
 * - Allows branded primitives (e.g. `Money<'USD'>` = `number & Brand<...>`) to
 *   accept their underlying primitive carrier (`number`), which `runChecked` and
 *   `Prove.fn` then validate against the Schema.
 */
export type ReturnCarrier<R> = R extends number
  ? [Exclude<keyof R, keyof number>] extends [never]
    ? R
    : number
  : R extends string
    ? [Exclude<keyof R, keyof string>] extends [never]
      ? R
      : string
    : R extends boolean
      ? [Exclude<keyof R, keyof boolean>] extends [never]
        ? R
        : boolean
      : R

/**
 * Scoped intermediate contract obligation preserved across `Fn` composition
 * (`compose`, `map`, `not`, `and`, `or`, `ifElse`, `partial`, `contramap`).
 *
 * Checked by `fn.runChecked` (evaluating `expr` once when active) and proved
 * by `Prove.fn` under the path guard `when` (if present).
 */
export interface FnObligation<Env> {
  readonly kind: 'param' | 'return'
  readonly label: string
  /** Optional path guard: obligation applies only when `when` evaluates to `true`. */
  readonly when: Option.Option<ExprType<Env, boolean | null>>
  /** Intermediate expression whose value is validated. */
  readonly expr: ExprType<Env, unknown>
  /** Optional Schema that `expr`'s value must satisfy. */
  readonly schema: Option.Option<Schema.Codec<unknown>>
  /** Postconditions over `{ params: Env, result: unknown }` that must hold for `expr`. */
  readonly ensures: ReadonlyArray<
    ExprType<{ readonly params: Env; readonly result: unknown }, boolean | null>
  >
}

/** Error returned by `fn.runChecked` when a contract boundary fails at runtime. */
export class FnContractError extends Data.TaggedError('FnContractError')<{
  readonly phase: 'params' | 'where' | 'body' | 'returns' | 'ensures'
  readonly detail: string
  readonly cause?: unknown
}> {
  override get message(): string {
    return `[metakit/fn] ${this.phase} contract failed: ${this.detail}`
  }
}

/** Signature-first specification built with `Fn.params(...)` before attaching `.body(...)`. */
export interface FnSpec<P extends ParamSchemas, R = unknown> extends Pipeable.Pipeable {
  readonly _tag: 'FnSpec'
  readonly params: P
  readonly paramsSchema: Schema.Struct<P>
  readonly whereClauses: ReadonlyArray<ExprType<ParamValues<P>, boolean | null>>
  readonly returnSchema: Option.Option<Schema.Codec<R>>
  readonly ensuresClauses: ReadonlyArray<ExprType<EnsuresEnv<P, R>, boolean | null>>
  /** Add a precondition (`where` clause). Stackable. */
  readonly where: (
    buildWhere: (args: ParamPaths<P>) => ExprInput<ParamValues<P>, boolean | null>,
  ) => FnSpec<P, R>
  /** Declare the return Schema (verified by `Prove.fn` and `runChecked`). */
  readonly returns: <S extends SchemaOf>(schema: S) => FnSpec<P, S['Type']>
  /** Add a postcondition (`ensures` clause over `{ params, result }`). Stackable. */
  readonly ensures: (
    buildEnsures: (env: EnsuresPaths<P, R>) => ExprInput<EnsuresEnv<P, R>, boolean | null>,
  ) => FnSpec<P, R>
  /** Attach the body expression, producing a callable `Fn`. */
  readonly body: <Out extends (unknown extends R ? unknown : ReturnCarrier<R>)>(
    buildBody: (args: ParamPaths<P>) => ExprInput<ParamValues<P>, Out>,
  ) => Fn<P, unknown extends R ? Out : R>
}

/**
 * A callable, inspectable, verifiable MetaKit function.
 *
 * - **Symbolic call (`fn(args)`)**: macro-like AST substitution of `args` into
 *   `body` (unchecked at the call site; preconditions and obligations are
 *   available via `fn.precondition(args)` and `fn.obligations`).
 * - **Checked runtime (`fn.runChecked(args)`)**: validates `params`, `where`,
 *   all scoped intermediate `obligations`, `body`, `returns`, and `ensures`.
 * - **Formal verification (`Prove.fn(fn)`)**: proves well-definedness, all
 *   scoped `obligations`, `returns`, and `ensures` in Z3.
 */
export interface Fn<P extends ParamSchemas, R> extends Pipeable.Pipeable {
  readonly _tag: 'Fn'
  readonly params: P
  readonly paramsSchema: Schema.Struct<P>
  readonly body: ExprType<ParamValues<P>, R>
  readonly whereClauses: ReadonlyArray<ExprType<ParamValues<P>, boolean | null>>
  readonly returnSchema: Option.Option<Schema.Codec<R>>
  readonly ensuresClauses: ReadonlyArray<ExprType<EnsuresEnv<P, R>, boolean | null>>
  /** Scoped intermediate contract obligations preserved across composition. */
  readonly obligations: ReadonlyArray<FnObligation<ParamValues<P>>>
  /** Symbolic call: substitutes argument expressions into `body`. */
  <Args extends ArgInputs<P>>(args: Args): ExprType<MergedArgEnv<Args>, R>
  /** Add a precondition (`where` clause). Stackable. */
  readonly where: (
    buildWhere: (args: ParamPaths<P>) => ExprInput<ParamValues<P>, boolean | null>,
  ) => Fn<P, R>
  /** Declare the return Schema (must be structurally compatible with `R`; verified by `Prove.fn` and `runChecked`). */
  readonly returns: <S extends SchemaOf>(
    schema: [R] extends [ReturnCarrier<S['Type']>] ? S : never,
  ) => Fn<P, S['Type']>
  /** Add a postcondition (`ensures` clause over `{ params, result }`). Stackable. */
  readonly ensures: (
    buildEnsures: (env: EnsuresPaths<P, R>) => ExprInput<EnsuresEnv<P, R>, boolean | null>,
  ) => Fn<P, R>
  /** Substituted precondition expression (`true` when no `where` clauses exist). */
  readonly precondition: <Args extends ArgInputs<P>>(
    args: Args,
  ) => ExprType<MergedArgEnv<Args>, boolean | null>
  /** Fast direct runtime evaluation over concrete parameter values. */
  readonly run: (args: ParamValues<P>, options?: Expr.ReaderOptions) => R
  /** Checked runtime evaluation verifying params Schema, `where`, intermediate `obligations`, `body`, `returns`, and `ensures`. */
  readonly runChecked: (
    args: unknown,
    options?: Expr.ReaderOptions,
  ) => Result.Result<R, FnContractError>
  /** Sequential composition with a single-parameter `Fn`: feeds this function's output into `next`. */
  readonly andThen: <K extends string, S extends SchemaOf, R2>(
    next: Fn<Readonly<Record<K, S>>, R2> &
      ([R] extends [ReturnCarrier<S['Type']>] ? unknown : never),
  ) => Fn<P, R2>
  /** Partial application: fix a subset of parameters to concrete literals, returning a `Fn` over the rest. */
  readonly partial: <const Fixed extends Partial<ParamValues<P>>>(
    fixed: Fixed,
  ) => Fn<Omit<P, keyof Fixed & keyof P>, R>
  /** Transform this function's output expression while preserving `params` and `where` clauses. */
  readonly map: <R2>(
    transform: (
      result: ExprType<ParamValues<P>, R>,
      params: ParamPaths<P>,
    ) => ExprInput<ParamValues<P>, R2>,
  ) => Fn<P, R2>
}

const paramPathsOf = <P extends ParamSchemas>(params: P): ParamPaths<P> => {
  const out: Record<string, unknown> = {}
  for (const [key, schema] of Object.entries(params)) {
    out[key] = Path.accessor([key], Option.some(schema.ast))
  }
  return out as ParamPaths<P>
}

const ensuresPathsOf = <P extends ParamSchemas, R>(
  paramsSchema: Schema.Struct<P>,
  returns: Option.Option<Schema.Codec<R>>,
): EnsuresPaths<P, R> => ({
  params: Path.accessor(['params'], Option.some(paramsSchema.ast)),
  result: Path.accessor(
    ['result'],
    Option.map(returns, s => s.ast),
  ),
})

/** Project nested segments `rest` off a substituted argument `Node`. */
const projectArg = (arg: Node.Node, rest: ReadonlyArray<string>, paramName: string): Node.Node =>
  Node.$match(arg, {
    Path: ({ segments }) => Node.Path({ segments: [...segments, ...rest], ast: Option.none() }),
    Lit: ({ value }) =>
      Node.Lit({ value: Option.getOrNull(Path.get(Path.make<unknown, unknown>(rest), value)) }),
    If: ({ cond, then, otherwise }) =>
      Node.If({
        cond,
        then: projectArg(then, rest, paramName),
        otherwise: projectArg(otherwise, rest, paramName),
      }),
    Match: ({ on, cases, otherwise }) =>
      Node.Match({
        on,
        cases: cases.map(([v, branch]) => [v, projectArg(branch, rest, paramName)] as const),
        otherwise: Option.map(otherwise, branch => projectArg(branch, rest, paramName)),
      }),
    Call: () => {
      throw new Error(
        `[metakit/fn] cannot project ".${rest.join('.')}" off computed argument "${paramName}"; pass a Path or literal.`,
      )
    },
    Opaque: () => {
      throw new Error(
        `[metakit/fn] cannot project ".${rest.join('.')}" off opaque argument "${paramName}".`,
      )
    },
    Rows: () => {
      throw new Error(
        `[metakit/fn] cannot project ".${rest.join('.')}" off fold argument "${paramName}".`,
      )
    },
  })

/** Alpha-rename `Rows` binders when a `Fn` is called inside an outer `Rows` fold. */
const freshenRows = (node: Node.Node, startDepth: number): Node.Node => {
  const renameBinder = (target: Node.Node, from: string, to: string): Node.Node =>
    Node.$match(target, {
      Lit: l => l,
      Path: p =>
        p.segments[0] === from
          ? Node.Path({ segments: [to, ...p.segments.slice(1)], ast: p.ast })
          : p,
      Call: ({ op, args }) => Node.Call({ op, args: args.map(a => renameBinder(a, from, to)) }),
      If: ({ cond, then, otherwise }) =>
        Node.If({
          cond: renameBinder(cond, from, to),
          then: renameBinder(then, from, to),
          otherwise: renameBinder(otherwise, from, to),
        }),
      Match: ({ on, cases, otherwise }) =>
        Node.Match({
          on: renameBinder(on, from, to),
          cases: cases.map(([v, b]) => [v, renameBinder(b, from, to)] as const),
          otherwise: Option.map(otherwise, b => renameBinder(b, from, to)),
        }),
      Opaque: o => o,
      Rows: rows =>
        Node.rowsEach(rows) === from
          ? Node.mapRows(
              rows,
              source => renameBinder(source, from, to),
              body => body,
            )
          : Node.mapRows(
              rows,
              source => renameBinder(source, from, to),
              body => renameBinder(body, from, to),
            ),
    })

  const visit = (current: Node.Node, depth: number): Node.Node =>
    Node.$match(current, {
      Lit: l => l,
      Path: p => p,
      Call: ({ op, args }) => Node.Call({ op, args: args.map(a => visit(a, depth)) }),
      If: ({ cond, then, otherwise }) =>
        Node.If({
          cond: visit(cond, depth),
          then: visit(then, depth),
          otherwise: visit(otherwise, depth),
        }),
      Match: ({ on, cases, otherwise }) =>
        Node.Match({
          on: visit(on, depth),
          cases: cases.map(([v, b]) => [v, visit(b, depth)] as const),
          otherwise: Option.map(otherwise, b => visit(b, depth)),
        }),
      Opaque: o => o,
      Rows: rows => {
        const oldBinder = Node.rowsEach(rows)
        const nextBinder = `${Node.EACH}#${depth}`
        const renamed = Node.mapRows(
          rows,
          source => visit(source, depth),
          body => visit(renameBinder(body, oldBinder, nextBinder), depth + 1),
        )
        return Node.Rows({ ...renamed, each: nextBinder })
      },
    })

  return visit(node, startDepth)
}

/** Default AST node occurrence budget for `Fn.iterate` unrolling. */
export const DEFAULT_MAX_EXPANSION_NODES = 10_000

const rowsChildren = (
  rows: Extract<Node.Node, { readonly _tag: 'Rows' }>,
): ReadonlyArray<Node.Node> => [Node.rowsSource(rows.over), ...Node.rowsBody(rows)]

const assertNoOpaque = (root: Node.Node): void => {
  const stack: Array<Node.Node> = [root]
  while (stack.length > 0) {
    const current = stack.pop()!
    Node.$match(current, {
      Lit: () => undefined,
      Path: () => undefined,
      Call: ({ args }) => {
        for (const a of args) stack.push(a)
      },
      If: ({ cond, then, otherwise }) => {
        stack.push(cond, then, otherwise)
      },
      Match: ({ on, cases, otherwise }) => {
        stack.push(on)
        for (const [, b] of cases) stack.push(b)
        if (Option.isSome(otherwise)) stack.push(otherwise.value)
      },
      Opaque: ({ name }) => {
        throw new Error(
          `[metakit/fn] cannot symbolically substitute Opaque node "${name}": Opaque functions read their original environment; use fn.run() or fn.runChecked() instead`,
        )
      },
      Rows: rows => {
        for (const child of rowsChildren(rows)) stack.push(child)
      },
    })
  }
}

const collectRootSegments = (nodes: Iterable<Node.Node>): ReadonlySet<string> => {
  const roots = new Set<string>()
  const stack: Array<Node.Node> = [...nodes]
  while (stack.length > 0) {
    const current = stack.pop()!
    Node.$match(current, {
      Lit: () => undefined,
      Path: ({ segments }) => {
        if (segments[0] !== undefined) roots.add(segments[0])
      },
      Call: ({ args }) => {
        for (const a of args) stack.push(a)
      },
      If: ({ cond, then, otherwise }) => {
        stack.push(cond, then, otherwise)
      },
      Match: ({ on, cases, otherwise }) => {
        stack.push(on)
        for (const [, b] of cases) stack.push(b)
        if (Option.isSome(otherwise)) stack.push(otherwise.value)
      },
      Opaque: () => undefined,
      Rows: rows => {
        roots.add(Node.rowsEach(rows))
        for (const child of rowsChildren(rows)) stack.push(child)
      },
    })
  }
  return roots
}

const hasCollidingRowsBinder = (root: Node.Node, avoided: ReadonlySet<string>): boolean => {
  if (avoided.size === 0) return false
  const stack: Array<Node.Node> = [root]
  while (stack.length > 0) {
    const current = stack.pop()!
    let hit = false
    Node.$match(current, {
      Lit: () => undefined,
      Path: () => undefined,
      Call: ({ args }) => {
        for (const a of args) stack.push(a)
      },
      If: ({ cond, then, otherwise }) => {
        stack.push(cond, then, otherwise)
      },
      Match: ({ on, cases, otherwise }) => {
        stack.push(on)
        for (const [, b] of cases) stack.push(b)
        if (Option.isSome(otherwise)) stack.push(otherwise.value)
      },
      Opaque: () => undefined,
      Rows: rows => {
        if (avoided.has(Node.rowsEach(rows))) hit = true
        for (const child of rowsChildren(rows)) stack.push(child)
      },
    })
    if (hit) return true
  }
  return false
}

const nextSafeDepth = (avoided: ReadonlySet<string>): number => {
  let depth = 1
  for (const name of avoided) {
    if (name.startsWith(`${Node.EACH}#`)) {
      const parsed = Number(name.slice(Node.EACH.length + 1))
      if (Number.isInteger(parsed) && parsed >= depth) depth = parsed + 1
    }
  }
  return depth
}

const countNodesCapped = (root: Node.Node, limit: number): number => {
  let count = 0
  const stack: Array<Node.Node> = [root]
  while (stack.length > 0) {
    count += 1
    if (count > limit) return count
    const current = stack.pop()!
    Node.$match(current, {
      Lit: () => undefined,
      Path: () => undefined,
      Call: ({ args }) => {
        for (const a of args) stack.push(a)
      },
      If: ({ cond, then, otherwise }) => {
        stack.push(cond, then, otherwise)
      },
      Match: ({ on, cases, otherwise }) => {
        stack.push(on)
        for (const [, b] of cases) stack.push(b)
        if (Option.isSome(otherwise)) stack.push(otherwise.value)
      },
      Opaque: () => undefined,
      Rows: rows => {
        for (const child of rowsChildren(rows)) stack.push(child)
      },
    })
  }
  return count
}

/** Substitute concrete/symbolic `args` into `node` over parameter names `paramNames`. */
const substituteArgs = (
  node: Node.Node,
  paramNames: ReadonlySet<string>,
  args: Readonly<Record<string, unknown>>,
): Node.Node => {
  assertNoOpaque(node)
  const argNodes = new Map<string, Node.Node>()
  for (const name of paramNames) {
    if (!Object.hasOwn(args, name)) {
      throw new Error(`[metakit/fn] missing argument "${name}"`)
    }
    argNodes.set(name, toNode(args[name]))
  }
  const outerEach = currentEach()
  const avoided = new Set(collectRootSegments(argNodes.values()))
  if (outerEach !== Node.EACH) avoided.add(outerEach)
  const hygienic = hasCollidingRowsBinder(node, avoided)
    ? freshenRows(node, nextSafeDepth(avoided))
    : node
  return Node.substitutePaths(hygienic, segments => {
    const head = segments[0]
    if (head === undefined || !argNodes.has(head)) return Option.none()
    const replacement = argNodes.get(head)!
    return Option.some(
      segments.length === 1 ? replacement : projectArg(replacement, segments.slice(1), head),
    )
  })
}

const conjoin = (nodes: ReadonlyArray<Node.Node>): Node.Node => {
  if (nodes.length === 0) return Node.Lit({ value: true })
  let acc = nodes[0]!
  for (let i = 1; i < nodes.length; i++) {
    acc = Node.Call({ op: Bool.andOp, args: [acc, nodes[i]!] })
  }
  return acc
}

const buildFn = <P extends ParamSchemas, R>(parts: {
  readonly params: P
  readonly paramsSchema: Schema.Struct<P>
  readonly body: ExprType<ParamValues<P>, R>
  readonly whereClauses: ReadonlyArray<ExprType<ParamValues<P>, boolean | null>>
  readonly returnSchema: Option.Option<Schema.Codec<R>>
  readonly ensuresClauses: ReadonlyArray<ExprType<EnsuresEnv<P, R>, boolean | null>>
  readonly obligations: ReadonlyArray<FnObligation<ParamValues<P>>>
}): Fn<P, R> => {
  const paramNames = new Set(Object.keys(parts.params))
  const decodeParams = Schema.decodeUnknownResult(parts.paramsSchema)
  const checkReturn = Option.map(parts.returnSchema, s => Schema.is(s))
  const obligationChecks = parts.obligations.map(ob => ({
    ob,
    checkSchema: Option.map(ob.schema, s => Schema.is(s)),
  }))

  const callSymbolic = <Args extends ArgInputs<P>>(args: Args): ExprType<MergedArgEnv<Args>, R> =>
    wrap(substituteArgs(parts.body.node, paramNames, args))

  const precondition = <Args extends ArgInputs<P>>(
    args: Args,
  ): ExprType<MergedArgEnv<Args>, boolean | null> =>
    wrap(conjoin(parts.whereClauses.map(w => substituteArgs(w.node, paramNames, args))))

  const run = (args: ParamValues<P>, options?: Expr.ReaderOptions): R =>
    Expr.evaluate(parts.body, args, options)

  const runChecked = (
    rawArgs: unknown,
    options?: Expr.ReaderOptions,
  ): Result.Result<R, FnContractError> => {
    const decoded = decodeParams(rawArgs)
    if (Result.isFailure(decoded)) {
      return Result.fail(
        new FnContractError({
          phase: 'params',
          detail: String(decoded.failure),
          cause: decoded.failure,
        }),
      )
    }
    const paramsVal = decoded.success as ParamValues<P>
    for (const w of parts.whereClauses) {
      try {
        if (Expr.evaluate(w, paramsVal, options) !== true) {
          return Result.fail(
            new FnContractError({ phase: 'where', detail: 'precondition did not hold' }),
          )
        }
      } catch (cause) {
        return Result.fail(new FnContractError({ phase: 'where', detail: String(cause), cause }))
      }
    }
    for (const { ob, checkSchema } of obligationChecks) {
      if (Option.isSome(ob.when)) {
        try {
          if (Expr.evaluate(ob.when.value, paramsVal, options) !== true) continue
        } catch (cause) {
          return Result.fail(
            new FnContractError({
              phase: 'where',
              detail: `obligation guard "${ob.label}" failed: ${String(cause)}`,
              cause,
            }),
          )
        }
      }
      let interVal: unknown
      try {
        interVal = Expr.evaluate(ob.expr, paramsVal, options)
      } catch (cause) {
        return Result.fail(
          new FnContractError({
            phase: 'body',
            detail: `intermediate expression "${ob.label}" refused: ${String(cause)}`,
            cause,
          }),
        )
      }
      if (Option.isSome(checkSchema) && !checkSchema.value(interVal)) {
        return Result.fail(
          new FnContractError({
            phase: ob.kind === 'param' ? 'params' : 'returns',
            detail: `intermediate ${ob.kind} Schema validation failed for "${ob.label}"`,
          }),
        )
      }
      for (const e of ob.ensures) {
        try {
          if (Expr.evaluate(e, { params: paramsVal, result: interVal }, options) !== true) {
            return Result.fail(
              new FnContractError({
                phase: 'ensures',
                detail: `intermediate postcondition failed for "${ob.label}"`,
              }),
            )
          }
        } catch (cause) {
          return Result.fail(
            new FnContractError({
              phase: 'ensures',
              detail: `intermediate postcondition "${ob.label}" failed: ${String(cause)}`,
              cause,
            }),
          )
        }
      }
    }
    let result: R
    try {
      result = Expr.evaluate(parts.body, paramsVal, options)
    } catch (cause) {
      return Result.fail(new FnContractError({ phase: 'body', detail: String(cause), cause }))
    }
    if (Option.isSome(checkReturn) && !checkReturn.value(result)) {
      return Result.fail(
        new FnContractError({
          phase: 'returns',
          detail: 'return value failed return Schema validation',
        }),
      )
    }
    for (const e of parts.ensuresClauses) {
      try {
        if (Expr.evaluate(e, { params: paramsVal, result }, options) !== true) {
          return Result.fail(
            new FnContractError({ phase: 'ensures', detail: 'postcondition did not hold' }),
          )
        }
      } catch (cause) {
        return Result.fail(new FnContractError({ phase: 'ensures', detail: String(cause), cause }))
      }
    }
    return Result.succeed(result)
  }

  const self: Fn<P, R> = Object.assign(callSymbolic, {
    _tag: 'Fn' as const,
    params: parts.params,
    paramsSchema: parts.paramsSchema,
    body: parts.body,
    whereClauses: parts.whereClauses,
    returnSchema: parts.returnSchema,
    ensuresClauses: parts.ensuresClauses,
    obligations: parts.obligations,
    where: (buildWhere: (args: ParamPaths<P>) => ExprInput<ParamValues<P>, boolean | null>) =>
      buildFn({
        ...parts,
        whereClauses: [
          ...parts.whereClauses,
          wrap<ParamValues<P>, boolean | null>(toNode(buildWhere(paramPathsOf(parts.params)))),
        ],
      }),
    returns: <S extends SchemaOf>(schema: [R] extends [ReturnCarrier<S['Type']>] ? S : never) =>
      buildFn<P, S['Type']>({
        params: parts.params,
        paramsSchema: parts.paramsSchema,
        body: parts.body as unknown as ExprType<ParamValues<P>, S['Type']>,
        whereClauses: parts.whereClauses,
        returnSchema: Option.some(schema as unknown as Schema.Codec<S['Type']>),
        ensuresClauses: parts.ensuresClauses as unknown as ReadonlyArray<
          ExprType<EnsuresEnv<P, S['Type']>, boolean | null>
        >,
        obligations: parts.obligations,
      }),
    ensures: (
      buildEnsures: (env: EnsuresPaths<P, R>) => ExprInput<EnsuresEnv<P, R>, boolean | null>,
    ) =>
      buildFn({
        ...parts,
        ensuresClauses: [
          ...parts.ensuresClauses,
          wrap<EnsuresEnv<P, R>, boolean | null>(
            toNode(buildEnsures(ensuresPathsOf(parts.paramsSchema, parts.returnSchema))),
          ),
        ],
      }),
    precondition,
    run,
    runChecked,
    andThen: <K extends string, S extends SchemaOf, R2>(
      next: Fn<Readonly<Record<K, S>>, R2> &
        ([R] extends [ReturnCarrier<S['Type']>] ? unknown : never),
    ): Fn<P, R2> => compose(self, next),
    partial: <const Fixed extends Partial<ParamValues<P>>>(
      fixed: Fixed,
    ): Fn<Omit<P, keyof Fixed & keyof P>, R> => partial(self, fixed),
    map: <R2>(
      transform: (
        result: ExprType<ParamValues<P>, R>,
        params: ParamPaths<P>,
      ) => ExprInput<ParamValues<P>, R2>,
    ): Fn<P, R2> => map(self, transform),
    pipe() {
      // eslint-disable-next-line prefer-rest-params
      return Pipeable.pipeArguments(this, arguments)
    },
  })
  return self
}

const buildSpec = <P extends ParamSchemas, R>(parts: {
  readonly params: P
  readonly paramsSchema: Schema.Struct<P>
  readonly whereClauses: ReadonlyArray<ExprType<ParamValues<P>, boolean | null>>
  readonly returnSchema: Option.Option<Schema.Codec<R>>
  readonly ensuresClauses: ReadonlyArray<ExprType<EnsuresEnv<P, R>, boolean | null>>
}): FnSpec<P, R> => ({
  _tag: 'FnSpec',
  params: parts.params,
  paramsSchema: parts.paramsSchema,
  whereClauses: parts.whereClauses,
  returnSchema: parts.returnSchema,
  ensuresClauses: parts.ensuresClauses,
  where: buildWhere =>
    buildSpec({
      ...parts,
      whereClauses: [
        ...parts.whereClauses,
        wrap<ParamValues<P>, boolean | null>(toNode(buildWhere(paramPathsOf(parts.params)))),
      ],
    }),
  returns: <S extends SchemaOf>(schema: S) =>
    buildSpec<P, S['Type']>({
      params: parts.params,
      paramsSchema: parts.paramsSchema,
      whereClauses: parts.whereClauses,
      returnSchema: Option.some(schema as unknown as Schema.Codec<S['Type']>),
      ensuresClauses: parts.ensuresClauses as unknown as ReadonlyArray<
        ExprType<EnsuresEnv<P, S['Type']>, boolean | null>
      >,
    }),
  ensures: buildEnsures =>
    buildSpec({
      ...parts,
      ensuresClauses: [
        ...parts.ensuresClauses,
        wrap<EnsuresEnv<P, R>, boolean | null>(
          toNode(buildEnsures(ensuresPathsOf(parts.paramsSchema, parts.returnSchema))),
        ),
      ],
    }),
  body: <Out extends (unknown extends R ? unknown : ReturnCarrier<R>)>(
    buildBody: (args: ParamPaths<P>) => ExprInput<ParamValues<P>, Out>,
  ) =>
    buildFn<P, unknown extends R ? Out : R>({
      params: parts.params,
      paramsSchema: parts.paramsSchema,
      body: wrap<ParamValues<P>, unknown extends R ? Out : R>(
        toNode(buildBody(paramPathsOf(parts.params))),
      ),
      whereClauses: parts.whereClauses,
      returnSchema: parts.returnSchema as unknown as Option.Option<
        Schema.Codec<unknown extends R ? Out : R>
      >,
      ensuresClauses: parts.ensuresClauses as unknown as ReadonlyArray<
        ExprType<EnsuresEnv<P, unknown extends R ? Out : R>, boolean | null>
      >,
      obligations: [],
    }),
  pipe() {
    // eslint-disable-next-line prefer-rest-params
    return Pipeable.pipeArguments(this, arguments)
  },
})

/** Start a signature-first function specification from named parameter Schemas. */
export const params = <P extends ParamSchemas>(paramSchemas: P): FnSpec<P, unknown> =>
  buildSpec({
    params: paramSchemas,
    paramsSchema: Schema.Struct(paramSchemas),
    whereClauses: [],
    returnSchema: Option.none(),
    ensuresClauses: [],
  })

/** Define a callable MetaKit function from named parameter Schemas and a body expression. */
export const make = <P extends ParamSchemas, R>(
  paramSchemas: P,
  buildBody: (args: ParamPaths<P>) => ExprInput<ParamValues<P>, R>,
): Fn<P, R> => {
  const paramsSchema = Schema.Struct(paramSchemas)
  const paths = paramPathsOf(paramSchemas)
  const bodyExpr = wrap<ParamValues<P>, R>(toNode(buildBody(paths)))
  return buildFn({
    params: paramSchemas,
    paramsSchema,
    body: bodyExpr,
    whereClauses: [],
    returnSchema: Option.none(),
    ensuresClauses: [],
    obligations: [],
  })
}

// ---------------------------------------------------------------------------
// Composition & Combinators
// ---------------------------------------------------------------------------

/** Rewrite `params.<name>` inside an `ensures` clause using `argNodes`, prefixing remaining paths with `params`. */
const substituteEnsuresParams = (
  node: Node.Node,
  argNodes: ReadonlyMap<string, Node.Node>,
): Node.Node =>
  Node.substitutePaths(node, segments => {
    if (segments[0] !== 'params') return Option.none()
    const head = segments[1]
    if (head === undefined || !argNodes.has(head)) return Option.none()
    const replacement = Node.prefix(argNodes.get(head)!, ['params'])
    return Option.some(
      segments.length === 2 ? replacement : projectArg(replacement, segments.slice(2), head),
    )
  })

const mergeParamSchemas = (list: ReadonlyArray<ParamSchemas>): Record<string, SchemaOf> => {
  const merged: Record<string, SchemaOf> = {}
  for (const paramsObj of list) {
    for (const [k, schema] of Object.entries(paramsObj)) {
      const existing = merged[k]
      if (existing === undefined) {
        merged[k] = schema
      } else if (existing !== schema && existing.ast !== schema.ast) {
        throw new Error(
          `[metakit/fn] conflicting parameter Schemas for shared parameter "${k}" when combining functions`,
        )
      }
    }
  }
  return merged
}

const selfReturnObligation = <P extends ParamSchemas, R>(
  f: Fn<P, R>,
  label: string,
): ReadonlyArray<FnObligation<ParamValues<P>>> => {
  if (Option.isNone(f.returnSchema) && f.ensuresClauses.length === 0) return []
  return [
    {
      kind: 'return',
      label,
      when: Option.none(),
      expr: f.body,
      schema: f.returnSchema as Option.Option<Schema.Codec<unknown>>,
      ensures: f.ensuresClauses as ReadonlyArray<
        ExprType<{ readonly params: ParamValues<P>; readonly result: unknown }, boolean | null>
      >,
    },
  ]
}

const substituteObligation = <EnvFrom, EnvTo>(
  ob: FnObligation<EnvFrom>,
  subExpr: (node: Node.Node) => Node.Node,
  subEnsures: (node: Node.Node) => Node.Node,
): FnObligation<EnvTo> => ({
  kind: ob.kind,
  label: ob.label,
  when: Option.map(ob.when, w => wrap<EnvTo, boolean | null>(subExpr(w.node))),
  expr: wrap<EnvTo, unknown>(subExpr(ob.expr.node)),
  schema: ob.schema,
  ensures: ob.ensures.map(e =>
    wrap<{ readonly params: EnvTo; readonly result: unknown }, boolean | null>(subEnsures(e.node)),
  ),
})

const guardObligation = <Env>(ob: FnObligation<Env>, guardNode: Node.Node): FnObligation<Env> => ({
  ...ob,
  when: Option.some(
    wrap<Env, boolean | null>(
      Option.isNone(ob.when)
        ? guardNode
        : Node.Call({ op: Bool.andOp, args: [guardNode, ob.when.value.node] }),
    ),
  ),
})

const isTrueGuard = (condNode: Node.Node): Node.Node =>
  Node.Call({ op: coalesceOp, args: [condNode, Node.Lit({ value: false })] })

const isFalseGuard = (condNode: Node.Node): Node.Node =>
  Node.Call({
    op: Bool.notOp,
    args: [Node.Call({ op: coalesceOp, args: [condNode, Node.Lit({ value: true })] })],
  })

/**
 * Sequential composition (`g ∘ f`).
 *
 * - Unary `g` (`compose(f, g)`): feeds `f`'s output into `g`'s sole parameter.
 * - Multi-param `g` (`compose(f, g, (out, params) => ({ ... }))`): maps `f`'s
 *   output and original parameters into `g`'s parameter record.
 *
 * Preserves `f`'s `where` clauses, records `f`'s return/ensures and `g`'s
 * parameter Schema checks as scoped intermediate `obligations`, substitutes
 * `g`'s `where`, `obligations`, and `ensures` over `f`'s parameters, and keeps
 * `g`'s `returnSchema`.
 */
export function compose<P extends ParamSchemas, R, K extends string, S extends SchemaOf, R2>(
  f: Fn<P, R>,
  g: Fn<Readonly<Record<K, S>>, R2> & ([R] extends [ReturnCarrier<S['Type']>] ? unknown : never),
): Fn<P, R2>
export function compose<P extends ParamSchemas, R, P2 extends ParamSchemas, R2>(
  f: Fn<P, R>,
  g: Fn<P2, R2>,
  mapArgs: (
    out: ExprType<ParamValues<P>, R>,
    params: ParamPaths<P>,
  ) => { readonly [K in keyof P2]: ExprInput<ParamValues<P>, ReturnCarrier<P2[K]['Type']>> },
): Fn<P, R2>
export function compose<P extends ParamSchemas, R, P2 extends ParamSchemas, R2>(
  f: Fn<P, R>,
  g: Fn<P2, R2>,
  mapArgs?: (
    out: ExprType<ParamValues<P>, R>,
    params: ParamPaths<P>,
  ) => Readonly<Record<string, unknown>>,
): Fn<P, R2> {
  const gParamKeys = Object.keys(g.params)
  let gArgs: Readonly<Record<string, unknown>>
  if (mapArgs !== undefined) {
    gArgs = mapArgs(f.body, paramPathsOf(f.params))
  } else {
    if (gParamKeys.length !== 1) {
      throw new Error(
        `[metakit/fn] Fn.compose(f, g) without a mapper requires g to have exactly 1 parameter, got ${gParamKeys.length} (${gParamKeys.join(', ')})`,
      )
    }
    gArgs = { [gParamKeys[0]!]: f.body }
  }

  const gParamSet = new Set(gParamKeys)
  const gArgNodes = new Map<string, Node.Node>()
  for (const key of gParamKeys) {
    if (!Object.hasOwn(gArgs, key)) {
      throw new Error(`[metakit/fn] Fn.compose missing argument "${key}" for second function`)
    }
    gArgNodes.set(key, toNode(gArgs[key]))
  }

  const body = wrap<ParamValues<P>, R2>(substituteArgs(g.body.node, gParamSet, gArgs))
  const gWheres = g.whereClauses.map(w =>
    wrap<ParamValues<P>, boolean | null>(substituteArgs(w.node, gParamSet, gArgs)),
  )
  const gEnsures = g.ensuresClauses.map(e =>
    wrap<EnsuresEnv<P, R2>, boolean | null>(substituteEnsuresParams(e.node, gArgNodes)),
  )
  const gParamObligations: Array<FnObligation<ParamValues<P>>> = gParamKeys.map(key => ({
    kind: 'param',
    label: `compose.param:${key}`,
    when: Option.none(),
    expr: wrap<ParamValues<P>, unknown>(gArgNodes.get(key)!),
    schema: Option.some(g.params[key]! as unknown as Schema.Codec<unknown>),
    ensures: [],
  }))
  const gObligations = g.obligations.map(ob =>
    substituteObligation<ParamValues<P2>, ParamValues<P>>(
      ob,
      n => substituteArgs(n, gParamSet, gArgs),
      n => substituteEnsuresParams(n, gArgNodes),
    ),
  )

  return buildFn({
    params: f.params,
    paramsSchema: f.paramsSchema,
    body,
    whereClauses: [...f.whereClauses, ...gWheres],
    returnSchema: g.returnSchema,
    ensuresClauses: gEnsures,
    obligations: [
      ...f.obligations,
      ...selfReturnObligation(f, 'compose.first'),
      ...gParamObligations,
      ...gObligations,
    ],
  })
}

/**
 * Partial application: fix a subset of `f`'s parameters to concrete literals,
 * returning a specialized `Fn` over the remaining parameters with `body`,
 * `whereClauses`, `obligations`, and `ensuresClauses` substituted.
 */
export const partial = <P extends ParamSchemas, R, const Fixed extends Partial<ParamValues<P>>>(
  f: Fn<P, R>,
  fixed: Fixed,
): Fn<Omit<P, keyof Fixed & keyof P>, R> => {
  type Remaining = Omit<P, keyof Fixed & keyof P>
  const fixedKeys = Object.keys(fixed)
  for (const key of fixedKeys) {
    if (!Object.hasOwn(f.params, key)) {
      throw new Error(`[metakit/fn] Fn.partial received unknown parameter "${key}"`)
    }
    const val = (fixed as Readonly<Record<string, unknown>>)[key]
    const paramSchema = f.params[key]! as unknown as Schema.Codec<unknown>
    if (!Schema.is(paramSchema)(val)) {
      throw new Error(
        `[metakit/fn] Fn.partial value for "${key}" does not satisfy its parameter Schema`,
      )
    }
  }
  const fixedSet = new Set(fixedKeys)
  const remainingParams: Record<string, SchemaOf> = {}
  for (const [key, schema] of Object.entries(f.params)) {
    if (!fixedSet.has(key)) remainingParams[key] = schema
  }
  const fixedNodes = new Map<string, Node.Node>()
  for (const key of fixedKeys) {
    fixedNodes.set(key, Node.Lit({ value: (fixed as Readonly<Record<string, unknown>>)[key] }))
  }
  const sub = (node: Node.Node): Node.Node =>
    Node.substitutePaths(node, segments => {
      const head = segments[0]
      if (head === undefined || !fixedNodes.has(head)) return Option.none()
      const replacement = fixedNodes.get(head)!
      return Option.some(
        segments.length === 1 ? replacement : projectArg(replacement, segments.slice(1), head),
      )
    })

  const rem = remainingParams as Remaining
  return buildFn<Remaining, R>({
    params: rem,
    paramsSchema: Schema.Struct(rem),
    body: wrap<ParamValues<Remaining>, R>(sub(f.body.node)),
    whereClauses: f.whereClauses.map(w =>
      wrap<ParamValues<Remaining>, boolean | null>(sub(w.node)),
    ),
    returnSchema: f.returnSchema,
    ensuresClauses: f.ensuresClauses.map(e =>
      wrap<EnsuresEnv<Remaining, R>, boolean | null>(substituteEnsuresParams(e.node, fixedNodes)),
    ),
    obligations: f.obligations.map(ob =>
      substituteObligation<ParamValues<P>, ParamValues<Remaining>>(ob, sub, n =>
        substituteEnsuresParams(n, fixedNodes),
      ),
    ),
  })
}

/** Transform `f`'s output expression while preserving `params`, `whereClauses`, and intermediate `obligations`. */
export const map = <P extends ParamSchemas, R, R2>(
  f: Fn<P, R>,
  transform: (
    result: ExprType<ParamValues<P>, R>,
    params: ParamPaths<P>,
  ) => ExprInput<ParamValues<P>, R2>,
): Fn<P, R2> =>
  buildFn({
    params: f.params,
    paramsSchema: f.paramsSchema,
    body: wrap<ParamValues<P>, R2>(toNode(transform(f.body, paramPathsOf(f.params)))),
    whereClauses: f.whereClauses,
    returnSchema: Option.none(),
    ensuresClauses: [],
    obligations: [...f.obligations, ...selfReturnObligation(f, 'map.input')],
  })

/** Adapt `f` to a new parameter schema `newParams` by mapping inputs through `mapArgs`. */
export const contramap = <P extends ParamSchemas, R, P2 extends ParamSchemas>(
  f: Fn<P, R>,
  newParams: P2,
  mapArgs: (args: ParamPaths<P2>) => {
    readonly [K in keyof P]: ExprInput<ParamValues<P2>, ReturnCarrier<P[K]['Type']>>
  },
): Fn<P2, R> => {
  const mapped = mapArgs(paramPathsOf(newParams))
  const fKeys = Object.keys(f.params)
  const fKeySet = new Set(fKeys)
  const argNodes = new Map<string, Node.Node>()
  for (const key of fKeys) {
    argNodes.set(key, toNode((mapped as Readonly<Record<string, unknown>>)[key]))
  }
  const paramObligations: Array<FnObligation<ParamValues<P2>>> = fKeys.map(key => ({
    kind: 'param',
    label: `contramap.param:${key}`,
    when: Option.none(),
    expr: wrap<ParamValues<P2>, unknown>(argNodes.get(key)!),
    schema: Option.some(f.params[key]! as unknown as Schema.Codec<unknown>),
    ensures: [],
  }))
  return buildFn({
    params: newParams,
    paramsSchema: Schema.Struct(newParams),
    body: wrap<ParamValues<P2>, R>(substituteArgs(f.body.node, fKeySet, mapped)),
    whereClauses: f.whereClauses.map(w =>
      wrap<ParamValues<P2>, boolean | null>(substituteArgs(w.node, fKeySet, mapped)),
    ),
    returnSchema: f.returnSchema,
    ensuresClauses: f.ensuresClauses.map(e =>
      wrap<EnsuresEnv<P2, R>, boolean | null>(substituteEnsuresParams(e.node, argNodes)),
    ),
    obligations: [
      ...paramObligations,
      ...f.obligations.map(ob =>
        substituteObligation<ParamValues<P>, ParamValues<P2>>(
          ob,
          n => substituteArgs(n, fKeySet, mapped),
          n => substituteEnsuresParams(n, argNodes),
        ),
      ),
    ],
  })
}

/** Negate a boolean predicate `Fn`. */
export const not = <P extends ParamSchemas, R extends boolean | null>(
  f: Fn<P, R>,
): Fn<P, boolean | (null extends R ? null : never)> =>
  buildFn({
    params: f.params,
    paramsSchema: f.paramsSchema,
    body: wrap<ParamValues<P>, boolean | (null extends R ? null : never)>(
      Node.Call({ op: Bool.notOp, args: [f.body.node] }),
    ),
    whereClauses: f.whereClauses,
    returnSchema: Option.none(),
    ensuresClauses: [],
    obligations: [...f.obligations, ...selfReturnObligation(f, 'not.input')],
  })

/** Conjunction (`f && g`) of two boolean predicate `Fn`s, merging their parameters, preconditions, and obligations. */
export const and = <
  P1 extends ParamSchemas,
  P2 extends ParamSchemas,
  R1 extends boolean | null,
  R2 extends boolean | null,
>(
  f: Fn<P1, R1>,
  g: Fn<P2, R2>,
): Fn<P1 & P2, boolean | (null extends R1 | R2 ? null : never)> => {
  const merged = mergeParamSchemas([f.params, g.params]) as P1 & P2
  return buildFn({
    params: merged,
    paramsSchema: Schema.Struct(merged),
    body: wrap<ParamValues<P1 & P2>, boolean | (null extends R1 | R2 ? null : never)>(
      Node.Call({ op: Bool.andOp, args: [f.body.node, g.body.node] }),
    ),
    whereClauses: [
      ...(f.whereClauses as ReadonlyArray<ExprType<ParamValues<P1 & P2>, boolean | null>>),
      ...(g.whereClauses as ReadonlyArray<ExprType<ParamValues<P1 & P2>, boolean | null>>),
    ],
    returnSchema: Option.none(),
    ensuresClauses: [],
    obligations: [
      ...(f.obligations as ReadonlyArray<FnObligation<ParamValues<P1 & P2>>>),
      ...(selfReturnObligation(f, 'and.left') as ReadonlyArray<FnObligation<ParamValues<P1 & P2>>>),
      ...(g.obligations as ReadonlyArray<FnObligation<ParamValues<P1 & P2>>>),
      ...(selfReturnObligation(g, 'and.right') as ReadonlyArray<
        FnObligation<ParamValues<P1 & P2>>
      >),
    ],
  })
}

/** Disjunction (`f || g`) of two boolean predicate `Fn`s, merging their parameters, preconditions, and obligations. */
export const or = <
  P1 extends ParamSchemas,
  P2 extends ParamSchemas,
  R1 extends boolean | null,
  R2 extends boolean | null,
>(
  f: Fn<P1, R1>,
  g: Fn<P2, R2>,
): Fn<P1 & P2, boolean | (null extends R1 | R2 ? null : never)> => {
  const merged = mergeParamSchemas([f.params, g.params]) as P1 & P2
  return buildFn({
    params: merged,
    paramsSchema: Schema.Struct(merged),
    body: wrap<ParamValues<P1 & P2>, boolean | (null extends R1 | R2 ? null : never)>(
      Node.Call({ op: Bool.orOp, args: [f.body.node, g.body.node] }),
    ),
    whereClauses: [
      ...(f.whereClauses as ReadonlyArray<ExprType<ParamValues<P1 & P2>, boolean | null>>),
      ...(g.whereClauses as ReadonlyArray<ExprType<ParamValues<P1 & P2>, boolean | null>>),
    ],
    returnSchema: Option.none(),
    ensuresClauses: [],
    obligations: [
      ...(f.obligations as ReadonlyArray<FnObligation<ParamValues<P1 & P2>>>),
      ...(selfReturnObligation(f, 'or.left') as ReadonlyArray<FnObligation<ParamValues<P1 & P2>>>),
      ...(g.obligations as ReadonlyArray<FnObligation<ParamValues<P1 & P2>>>),
      ...(selfReturnObligation(g, 'or.right') as ReadonlyArray<FnObligation<ParamValues<P1 & P2>>>),
    ],
  })
}

/** Logical implication (`f => g`, i.e. `!f || g`) of two boolean predicate `Fn`s. */
export const implies = <
  P1 extends ParamSchemas,
  P2 extends ParamSchemas,
  R1 extends boolean | null,
  R2 extends boolean | null,
>(
  f: Fn<P1, R1>,
  g: Fn<P2, R2>,
): Fn<P1 & P2, boolean | (null extends R1 | R2 ? null : never)> =>
  or(not(f), g) as Fn<P1 & P2, boolean | (null extends R1 | R2 ? null : never)>

/**
 * Conditional branching combinator: evaluates `onTrue` when `cond` is `true`,
 * `onFalse` when `cond` is `false`, and `null` when `cond` is `null`.
 * Each branch's preconditions and obligations are guarded by the exact branch
 * path condition (`cond === true` / `cond === false`), so `cond === null`
 * discharges neither branch's contracts.
 */
export const ifElse = <
  PC extends ParamSchemas,
  RC extends boolean | null,
  PT extends ParamSchemas,
  PF extends ParamSchemas,
  RT,
  RF,
>(
  cond: Fn<PC, RC>,
  onTrue: Fn<PT, RT>,
  onFalse: Fn<PF, RF>,
): Fn<PC & PT & PF, RT | RF | (null extends RC ? null : never)> => {
  type Merged = PC & PT & PF
  const merged = mergeParamSchemas([cond.params, onTrue.params, onFalse.params]) as Merged
  const trueGuard = isTrueGuard(cond.body.node)
  const falseGuard = isFalseGuard(cond.body.node)
  const guardedTrue = onTrue.whereClauses.map(w =>
    wrap<ParamValues<Merged>, boolean | null>(
      Node.If({ cond: trueGuard, then: w.node, otherwise: Node.Lit({ value: true }) }),
    ),
  )
  const guardedFalse = onFalse.whereClauses.map(w =>
    wrap<ParamValues<Merged>, boolean | null>(
      Node.If({ cond: falseGuard, then: w.node, otherwise: Node.Lit({ value: true }) }),
    ),
  )
  const trueObligations = [
    ...(onTrue.obligations as ReadonlyArray<FnObligation<ParamValues<Merged>>>),
    ...(selfReturnObligation(onTrue, 'ifElse.then') as ReadonlyArray<
      FnObligation<ParamValues<Merged>>
    >),
  ].map(ob => guardObligation(ob, trueGuard))
  const falseObligations = [
    ...(onFalse.obligations as ReadonlyArray<FnObligation<ParamValues<Merged>>>),
    ...(selfReturnObligation(onFalse, 'ifElse.else') as ReadonlyArray<
      FnObligation<ParamValues<Merged>>
    >),
  ].map(ob => guardObligation(ob, falseGuard))
  return buildFn({
    params: merged,
    paramsSchema: Schema.Struct(merged),
    body: wrap<ParamValues<Merged>, RT | RF | (null extends RC ? null : never)>(
      Node.If({ cond: cond.body.node, then: onTrue.body.node, otherwise: onFalse.body.node }),
    ),
    whereClauses: [
      ...(cond.whereClauses as ReadonlyArray<ExprType<ParamValues<Merged>, boolean | null>>),
      ...guardedTrue,
      ...guardedFalse,
    ],
    returnSchema: Option.none(),
    ensuresClauses: [],
    obligations: [
      ...(cond.obligations as ReadonlyArray<FnObligation<ParamValues<Merged>>>),
      ...(selfReturnObligation(cond, 'ifElse.cond') as ReadonlyArray<
        FnObligation<ParamValues<Merged>>
      >),
      ...trueObligations,
      ...falseObligations,
    ],
  })
}

/** Identity `Fn` for a single parameter `{ value: S }`. */
export const identity = <S extends SchemaOf>(schema: S): Fn<{ readonly value: S }, S['Type']> =>
  make({ value: schema }, ({ value }) => value).returns(
    schema as [S['Type']] extends [ReturnCarrier<S['Type']>] ? S : never,
  )

/** Constant `Fn` ignoring `paramSchemas` and always returning `value`. */
export const constant = <P extends ParamSchemas, const A>(paramSchemas: P, value: A): Fn<P, A> =>
  make(paramSchemas, () => value)

/**
 * Static `n`-fold composition of a single-parameter endomorphism `f`
 * (`f(f(...f(x)))`). Statically unrolled so it remains terminating,
 * SQL-lowerable, and Z3-verifiable.
 */
export const iterate = <K extends string, S extends SchemaOf>(
  f: Fn<Readonly<Record<K, S>>, S['Type']>,
  n: number,
  options?: { readonly maxNodes?: number },
): Fn<Readonly<Record<K, S>>, S['Type']> => {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`[metakit/fn] Fn.iterate requires a non-negative integer count, got ${n}`)
  }
  const maxNodes = options?.maxNodes ?? DEFAULT_MAX_EXPANSION_NODES
  const keys = Object.keys(f.params)
  if (keys.length !== 1) {
    throw new Error(
      `[metakit/fn] Fn.iterate requires a single-parameter function, got ${keys.length} (${keys.join(', ')})`,
    )
  }
  const soleKey = keys[0]! as K
  if (n === 0) {
    return buildFn({
      params: f.params,
      paramsSchema: f.paramsSchema,
      body: wrap<ParamValues<Readonly<Record<K, S>>>, S['Type']>(
        Node.Path({ segments: [soleKey], ast: Option.some(f.params[soleKey].ast) }),
      ),
      whereClauses: [],
      returnSchema: f.returnSchema,
      ensuresClauses: [],
      obligations: [],
    })
  }
  let acc = f
  for (let i = 1; i < n; i++) {
    acc = compose(
      acc,
      f as Fn<Readonly<Record<K, S>>, S['Type']> &
        ([S['Type']] extends [ReturnCarrier<S['Type']>] ? unknown : never),
    )
    if (countNodesCapped(acc.body.node, maxNodes) > maxNodes) {
      throw new RangeError(
        `[metakit/fn] Fn.iterate expansion exceeded budget of ${maxNodes} nodes at step ${i + 1}`,
      )
    }
  }
  return acc
}
