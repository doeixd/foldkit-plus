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
  readonly body: <Out = R>(
    buildBody: (args: ParamPaths<P>) => ExprInput<ParamValues<P>, Out>,
  ) => Fn<P, unknown extends R ? Out : R>
}

/** A callable, inspectable, verifiable MetaKit function. */
export interface Fn<P extends ParamSchemas, R> extends Pipeable.Pipeable {
  readonly _tag: 'Fn'
  readonly params: P
  readonly paramsSchema: Schema.Struct<P>
  readonly body: ExprType<ParamValues<P>, R>
  readonly whereClauses: ReadonlyArray<ExprType<ParamValues<P>, boolean | null>>
  readonly returnSchema: Option.Option<Schema.Codec<R>>
  readonly ensuresClauses: ReadonlyArray<ExprType<EnsuresEnv<P, R>, boolean | null>>
  /** Symbolic call: substitutes argument expressions into `body`. */
  <Args extends ArgInputs<P>>(args: Args): ExprType<MergedArgEnv<Args>, R>
  /** Add a precondition (`where` clause). Stackable. */
  readonly where: (
    buildWhere: (args: ParamPaths<P>) => ExprInput<ParamValues<P>, boolean | null>,
  ) => Fn<P, R>
  /** Declare the return Schema (verified by `Prove.fn` and `runChecked`). */
  readonly returns: <S extends SchemaOf>(schema: S) => Fn<P, S['Type']>
  /** Add a postcondition (`ensures` clause over `{ params, result }`). Stackable. */
  readonly ensures: (
    buildEnsures: (env: EnsuresPaths<P, R>) => ExprInput<EnsuresEnv<P, R>, boolean | null>,
  ) => Fn<P, R>
  /** Substituted precondition expression (`true` when no `where` clauses exist). */
  readonly precondition: <Args extends ArgInputs<P>>(
    args: Args,
  ) => ExprType<MergedArgEnv<Args>, boolean | null>
  /** Fast direct runtime evaluation over concrete parameter values. */
  readonly run: (args: ParamValues<P>) => R
  /** Checked runtime evaluation verifying params Schema, `where`, `returns`, and `ensures`. */
  readonly runChecked: (args: unknown) => Result.Result<R, FnContractError>
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

/** Substitute concrete/symbolic `args` into `node` over parameter names `paramNames`. */
const substituteArgs = (
  node: Node.Node,
  paramNames: ReadonlySet<string>,
  args: Readonly<Record<string, unknown>>,
): Node.Node => {
  const argNodes = new Map<string, Node.Node>()
  for (const name of paramNames) {
    if (!Object.hasOwn(args, name)) {
      throw new Error(`[metakit/fn] missing argument "${name}"`)
    }
    argNodes.set(name, toNode(args[name]))
  }
  const outerEach = currentEach()
  const prepared =
    outerEach === Node.EACH
      ? node
      : freshenRows(node, Number(outerEach.slice(Node.EACH.length + 1)) || 1)
  return Node.substitutePaths(prepared, segments => {
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
}): Fn<P, R> => {
  const paramNames = new Set(Object.keys(parts.params))
  const decodeParams = Schema.decodeUnknownResult(parts.paramsSchema)
  const checkReturn = Option.map(parts.returnSchema, s => Schema.is(s))

  const callSymbolic = <Args extends ArgInputs<P>>(args: Args): ExprType<MergedArgEnv<Args>, R> =>
    wrap(substituteArgs(parts.body.node, paramNames, args))

  const precondition = <Args extends ArgInputs<P>>(
    args: Args,
  ): ExprType<MergedArgEnv<Args>, boolean | null> =>
    wrap(conjoin(parts.whereClauses.map(w => substituteArgs(w.node, paramNames, args))))

  const run = (args: ParamValues<P>): R => Expr.evaluate(parts.body, args)

  const runChecked = (rawArgs: unknown): Result.Result<R, FnContractError> => {
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
        if (Expr.evaluate(w, paramsVal) !== true) {
          return Result.fail(
            new FnContractError({ phase: 'where', detail: 'precondition did not hold' }),
          )
        }
      } catch (cause) {
        return Result.fail(new FnContractError({ phase: 'where', detail: String(cause), cause }))
      }
    }
    let result: R
    try {
      result = Expr.evaluate(parts.body, paramsVal)
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
        if (Expr.evaluate(e, { params: paramsVal, result }) !== true) {
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

  return Object.assign(callSymbolic, {
    _tag: 'Fn' as const,
    params: parts.params,
    paramsSchema: parts.paramsSchema,
    body: parts.body,
    whereClauses: parts.whereClauses,
    returnSchema: parts.returnSchema,
    ensuresClauses: parts.ensuresClauses,
    where: (buildWhere: (args: ParamPaths<P>) => ExprInput<ParamValues<P>, boolean | null>) =>
      buildFn({
        ...parts,
        whereClauses: [
          ...parts.whereClauses,
          wrap<ParamValues<P>, boolean | null>(toNode(buildWhere(paramPathsOf(parts.params)))),
        ],
      }),
    returns: <S extends SchemaOf>(schema: S) =>
      buildFn<P, S['Type']>({
        params: parts.params,
        paramsSchema: parts.paramsSchema,
        body: parts.body as unknown as ExprType<ParamValues<P>, S['Type']>,
        whereClauses: parts.whereClauses,
        returnSchema: Option.some(schema as unknown as Schema.Codec<S['Type']>),
        ensuresClauses: parts.ensuresClauses as unknown as ReadonlyArray<
          ExprType<EnsuresEnv<P, S['Type']>, boolean | null>
        >,
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
    pipe() {
      // eslint-disable-next-line prefer-rest-params
      return Pipeable.pipeArguments(this, arguments)
    },
  })
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
  body: <Out = R>(buildBody: (args: ParamPaths<P>) => ExprInput<ParamValues<P>, Out>) =>
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
  })
}
