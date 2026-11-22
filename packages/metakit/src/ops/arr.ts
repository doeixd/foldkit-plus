/**
 * Lists: their length (`arr.count`, `arr.isEmpty`), what a write makes of
 * one (`arr.append`, and `arr.include` and `arr.exclude` over a set held as a
 * sorted list of scalars), and the questions a `Rows` node asks of each
 * element (`any`, `every`, `count` with a test, `sum`, `min`, `max`, `find`,
 * `keep`).
 *
 * You write a fold's test as an arrow, called once while the expression is
 * built with a path for the element: `Arr.any(state.todos, todo =>
 * todo.completed)`. What is kept is the expression it returns, read under the
 * slice `each`, so every reader sees the test as nodes. A null list gives
 * null; a test that gives null does not pass.
 */
import { Option, Schema, SchemaAST } from 'effect'
import * as Node from '../node.js'
import * as Path from '../path.js'
import type { Expr, PathAccessor } from '../path.js'
import * as Bool from './bool.js'
import { call, toNode, wrap, type EnvOfInput, type ExprInput, type NullOf } from './core.js'
import { loadRowsEvaluation } from './rowsLoad.js'
import { byCodePoint, wellFormed } from './str.js'

/** An array operand; where it may be null, so may the result. */
export type NullableItems = ExprInput<never, ReadonlyArray<unknown> | null>

export const countOp: Node.Op<'arr.count'> = {
  id: 'arr.count',
  returns: 'number',
  nulls: 'strict',
  evaluate: ([items]) =>
    Array.isArray(items) ? items.length : Node.illTyped('arr.count', 'an array', items),
}

export const isEmptyOp: Node.Op<'arr.isEmpty'> = {
  id: 'arr.isEmpty',
  returns: 'boolean',
  nulls: 'strict',
  evaluate: ([items]) =>
    Array.isArray(items) ? items.length === 0 : Node.illTyped('arr.isEmpty', 'an array', items),
}

const normalizeHasScalar = (value: unknown): number | string | boolean | Node.Refusal => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    return Node.holdsNul([value]) ? Node.unportable('arr.has') : wellFormed(value)
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? Object.is(value, -0)
        ? 0
        : value
      : new Node.Refusal({ reason: 'non-finite', at: 'arr.has', detail: `operand is ${value}` })
  }
  return Node.illTyped('arr.has', 'a number, boolean or text', value)
}

export const hasOp: Node.Op<'arr.has'> = {
  id: 'arr.has',
  returns: 'boolean',
  nulls: 'strict',
  refuses: value => (Node.holdsNul([value]) ? Node.unportable('arr.has') : undefined),
  evaluate: ([items, rawNeedle]) => {
    if (!Array.isArray(items)) return Node.illTyped('arr.has', 'an array', items)
    const needle = normalizeHasScalar(rawNeedle)
    if (Node.isRefusal(needle)) return needle
    let found = false
    for (const item of items) {
      if (item === null || item === undefined) continue
      if (typeof item === 'string' && Node.holdsNul([item])) return Node.unportable('arr.has')
      if (typeof item === 'number' && !Number.isFinite(item)) {
        return new Node.Refusal({
          reason: 'non-finite',
          at: 'arr.has',
          detail: `list element is ${item}`,
        })
      }
      const norm =
        typeof item === 'string'
          ? wellFormed(item)
          : typeof item === 'number' && Object.is(item, -0)
            ? 0
            : item
      if (norm === needle) found = true
    }
    return found
  },
}

/** A refusal among `args`, which every list operation passes on first. */
const refusedOf = (args: ReadonlyArray<unknown>): Node.Refusal | undefined =>
  args.find(Node.isRefusal)

/**
 * `arr.append(list, element)`: the list with the element at the end. Called
 * as `arr.append(list, fields, ...values)` the element is the record of
 * those fields to those values, each field a `[name, option]` pair: where
 * `option` is true the element's Schema holds it as an Effect `Option`, which
 * takes the value as some and null as none. A null list gives null; a null
 * element is appended as it is, since a list may hold null.
 */
export const appendOp: Node.Op<'arr.append'> = {
  id: 'arr.append',
  returns: 'operand',
  nulls: 'own',
  evaluate: args => {
    const refused = refusedOf(args)
    if (refused !== undefined) return refused
    const [list, ...rest] = args
    if (list === null) return null
    if (!Array.isArray(list)) return Node.illTyped('arr.append', 'an array', list)
    if (rest.length === 1) return [...list, rest[0]]
    const [fields, ...values] = rest
    if (!Array.isArray(fields) || fields.length !== values.length) {
      return Node.illTyped('arr.append', 'a field per value', fields)
    }
    const record = fields.map(([name, option]: readonly [string, boolean], index) => {
      const value = values[index] ?? null
      return [name, option ? Option.fromNullOr(value) : value] as const
    })
    return [...list, Object.fromEntries(record)]
  },
}

/** A scalar a set may hold, or the refusal of anything else: a finite number or text without a NUL. */
const scalarOf = (id: Node.CoreOpId, value: unknown): number | string | Node.Refusal => {
  if (typeof value === 'string')
    return Node.holdsNul([value]) ? Node.unportable(id) : wellFormed(value)
  if (typeof value !== 'number') return Node.illTyped(id, 'a number or text', value)
  // -0 is held as 0, so includes of 0 and -0 agree in either order.
  return Number.isFinite(value)
    ? value + 0
    : new Node.Refusal({ reason: 'non-finite', at: id, detail: `${value} in a set` })
}

/** Ascending order of two scalars of one kind: numbers by value, text by code point. */
const compare = (
  id: Node.CoreOpId,
  a: number | string,
  b: number | string,
): number | Node.Refusal => {
  if (typeof a === 'number' && typeof b === 'number') return Math.sign(a - b)
  if (typeof a === 'string' && typeof b === 'string') return byCodePoint(a, b)
  return Node.illTyped(id, `a ${typeof b} in a set of ${typeof b}s`, a)
}

/**
 * A set held as a list kept in ascending order, with `value` in or out. The
 * order is a function of the contents, which is what lets two includes swap.
 * A null list gives null; a null value changes nothing, since a set holds no
 * null; a list it leaves as it was is returned as it was given.
 */
const setOp = <Id extends 'arr.include' | 'arr.exclude'>(id: Id): Node.Op<Id> => ({
  id,
  returns: 'operand',
  nulls: 'own',
  evaluate: args => {
    const refused = refusedOf(args)
    if (refused !== undefined) return refused
    const [list, raw] = args
    if (list === null) return null
    if (!Array.isArray(list)) return Node.illTyped(id, 'an array', list)
    if (raw === null) return list
    const value = scalarOf(id, raw)
    if (Node.isRefusal(value)) return value
    let at = list.length
    let found = false
    let sorted = true
    let prev: string | number | undefined
    const seen: Array<string | number> = []
    for (let index = 0; index < list.length; index++) {
      const held = scalarOf(id, list[index])
      if (Node.isRefusal(held)) return held
      const sign = compare(id, held, value)
      if (Node.isRefusal(sign)) return sign
      if (prev !== undefined) {
        const order = compare(id, prev, held)
        if (Node.isRefusal(order)) return order
        if (order >= 0) sorted = false
      }
      prev = held
      if (sign === 0) {
        found = true
        if (id === 'arr.exclude') continue
      } else if (sign > 0 && at === list.length) {
        at = index
      }
      seen.push(held)
    }
    if (sorted) {
      if (id === 'arr.include') {
        return found ? list : [...list.slice(0, at), value, ...list.slice(at)]
      }
      return found ? seen : list
    }
    // Unsorted or duplicate input: canonicalize to ascending unique order so
    // include/exclude agree in either order on any array.
    if (id === 'arr.include' && !found) seen.push(value)
    seen.sort((a, b) => compare(id, a, b) as number)
    const canonical: Array<string | number> = []
    for (const item of seen) {
      if (canonical.length === 0 || compare(id, canonical.at(-1)!, item) !== 0) {
        canonical.push(item)
      }
    }
    return canonical
  },
})

// Pure: a page that names neither keeps neither, nor what orders a set.
export const includeOp: Node.Op<'arr.include'> = /* @__PURE__ */ setOp('arr.include')
export const excludeOp: Node.Op<'arr.exclude'> = /* @__PURE__ */ setOp('arr.exclude')

/** The element type of a list expression. */
export type ElementOf<L> =
  L extends Expr<never, infer A>
    ? NonNullable<A> extends ReadonlyArray<infer E>
      ? E
      : never
    : never

/** The slice a body reads its element under. */
export interface EachEnv<E> {
  readonly each: E
}

/** What a body's arrow is given: a path for the element, typed by the list's element. */
export type Each<E> = PathAccessor<EachEnv<E>, E>

/** An environment a body reads, without the element it binds. */
export type Outside<Env> = unknown extends Env ? unknown : Omit<Env, 'each'>

/** The Schema of a list's elements, where the list's Schema says it. */
export const elementAst = (list: Node.Node): Option.Option<SchemaAST.AST> => {
  if (!Node.$is('Path')(list) || Option.isNone(list.ast)) return Option.none()
  const arrays = (ast: SchemaAST.AST): ReadonlyArray<SchemaAST.Arrays> => {
    if (SchemaAST.isUnion(ast)) return ast.types.flatMap(arrays)
    return SchemaAST.isArrays(ast) ? [ast] : []
  }
  const found = arrays(list.ast.value)
  return found.length === 1 && found[0]!.elements.length === 0 && found[0]!.rest.length === 1
    ? Option.some(found[0]!.rest[0]!)
    : Option.none()
}

/**
 * A body built from `build`, called once with a path for an element whose
 * Schema is `element`. A body holds no second `Rows` and no opaque term in
 * this phase, so every reader sees all it asks.
 */
export const bodyOf = (
  element: Option.Option<SchemaAST.AST>,
  build: (each: Each<unknown>) => unknown,
  name: string,
): Node.Node => {
  return checkBody(toNode(build(Path.accessor([Node.EACH], element))), name)
}

/** `node`, refused where it holds a second `Rows` or an opaque term, which no body may in this phase. */
export const checkBody = (node: Node.Node, name: string): Node.Node => {
  const refuse = (current: Node.Node): void =>
    Node.$match(current, {
      Lit: () => {},
      Path: () => {},
      Call: ({ args }) => args.forEach(refuse),
      If: ({ cond, then, otherwise }) => [cond, then, otherwise].forEach(refuse),
      Match: ({ on, cases, otherwise }) =>
        [on, ...cases.map(([, arm]) => arm), ...Option.toArray(otherwise)].forEach(refuse),
      Opaque: ({ name: opaque }) => {
        throw new Error(
          `[metakit] ${name}: a body holds no opaque term ("${opaque}"), which no reader could see`,
        )
      },
      Rows: () => {
        throw new Error(`[metakit] ${name}: a body holds no second Rows in this phase`)
      },
    })
  refuse(node)
  return node
}

/** A `Rows` node over `list`. */
export const rowsOver = (
  fold: Node.RowsFold,
  list: Node.Node,
  body: {
    readonly where?: Node.Node
    readonly value?: Node.Node
    readonly set?: ReadonlyArray<readonly [string, Node.Node]>
    readonly op?: Node.ForeignOp
  },
): Node.Node => {
  loadRowsEvaluation()
  return Node.Rows({
    fold,
    over: Node.RowsOver.List({ list }),
    where: Option.fromUndefinedOr(body.where),
    value: Option.fromUndefinedOr(body.value),
    set: body.set ?? [],
    ...(body.op === undefined ? {} : { op: body.op }),
  })
}

const fold =
  (kind: Node.RowsFold) =>
  (
    list: NullableItems,
    parts: {
      readonly test?: ((each: Each<unknown>) => unknown) | undefined
      readonly value?: ((each: Each<unknown>) => unknown) | undefined
    },
  ): Node.Node => {
    const source = toNode(list)
    const element = elementAst(source)
    const name = `Arr.${kind}`
    return rowsOver(kind, source, {
      ...(parts.test === undefined ? {} : { where: bodyOf(element, parts.test, name) }),
      ...(parts.value === undefined ? {} : { value: bodyOf(element, parts.value, name) }),
    })
  }

/** Whether some element passes `test`: false over none. */
export const any = <L extends NullableItems, R extends ExprInput<never, boolean | null>>(
  list: L,
  test: (each: Each<ElementOf<L>>) => R,
): Expr<EnvOfInput<L> & Outside<EnvOfInput<R>>, boolean | NullOf<L>> =>
  wrap(fold('any')(list, { test: test as (each: Each<unknown>) => R }))

/** Whether every element passes `test`: true over none. */
export const every = <L extends NullableItems, R extends ExprInput<never, boolean | null>>(
  list: L,
  test: (each: Each<ElementOf<L>>) => R,
): Expr<EnvOfInput<L> & Outside<EnvOfInput<R>>, boolean | NullOf<L>> =>
  wrap(fold('every')(list, { test: test as (each: Each<unknown>) => R }))

/** The number of elements (always `>= 0`), or, with `test`, of the elements that pass it. */
export function count<A extends NullableItems>(items: A): Expr<EnvOfInput<A>, number | NullOf<A>>
export function count<L extends NullableItems, R extends ExprInput<never, boolean | null>>(
  list: L,
  test: (each: Each<ElementOf<L>>) => R,
): Expr<EnvOfInput<L> & Outside<EnvOfInput<R>>, number | NullOf<L>>
export function count(
  list: NullableItems,
  test?: (each: Each<unknown>) => unknown,
): Expr<unknown, unknown> {
  return test === undefined ? call(countOp, [list]) : wrap(fold('count')(list, { test }))
}

type Body = (each: Each<unknown>) => unknown

/** A numeric fold over `list`: `value` of each element that passes `test`. */
type NumericFold<Result> = <
  L extends NullableItems,
  V extends ExprInput<never, number | null>,
  R extends ExprInput<never, boolean | null> = true,
>(
  list: L,
  value: (each: Each<ElementOf<L>>) => V,
  test?: (each: Each<ElementOf<L>>) => R,
) => Expr<
  EnvOfInput<L> & Outside<EnvOfInput<V>> & Outside<EnvOfInput<R>>,
  Result | (Result extends null ? never : NullOf<L>)
>

const numeric =
  (kind: Node.RowsFold) =>
  (list: NullableItems, value: Body, test?: Body): Expr<unknown, unknown> =>
    wrap(fold(kind)(list, { value, test }))

/**
 * The total of `value` over the elements that pass `test` (every one
 * without it): 0 over none; a null value adds nothing; an integer total
 * past ±(2^53−1) is refused.
 */
export const sum: NumericFold<number> = /* @__PURE__ */ numeric('sum') as NumericFold<number>

/** The least `value` of the elements that pass `test`: null over none, skipping a null value. */
export const min: NumericFold<number | null> = /* @__PURE__ */ numeric('min') as NumericFold<
  number | null
>

/** An operation claiming commutativity, associativity, and a two-sided identity. */
export interface CommutativeMonoid {
  readonly descriptor: Node.ForeignOp & {
    readonly args: readonly [Schema.Top, Schema.Top]
    readonly result: Schema.Top
    readonly claims: {
      readonly commutative: true
      readonly associative: true
      readonly identity: { readonly value: unknown; readonly side: 'both' }
    }
  }
}

/** Verify at runtime that `op` carries the commutative-monoid claims `reduce` requires. */
export const assertCommutativeMonoid = (op: Node.ForeignOp, caller: string): void => {
  const claims = op.claims
  if (
    claims?.commutative !== true ||
    claims?.associative !== true ||
    claims?.identity === undefined ||
    claims.identity.side !== 'both'
  ) {
    throw new Error(
      `[metakit] ${caller}: "${Node.foreignName(op)}" does not claim commutative and associative with an identity, so its answer over rows would depend on their order.`,
    )
  }
}

/**
 * Fold `value` over the elements of `list` that pass `test` using a declared
 * commutative-monoid operation `op`: returns `op`'s identity over no elements
 * and skips null contributions.
 */
export const reduce = <
  L extends NullableItems,
  O extends CommutativeMonoid,
  V extends ExprInput<never, Schema.Schema.Type<O['descriptor']['result']> | null>,
  T extends ExprInput<never, boolean | null> = true,
>(
  list: L,
  op: O,
  value: (each: Each<ElementOf<L>>) => V,
  test?: (each: Each<ElementOf<L>>) => T,
): Expr<
  EnvOfInput<L> & Outside<EnvOfInput<V>> & Outside<EnvOfInput<T>>,
  Schema.Schema.Type<O['descriptor']['result']> | NullOf<L>
> => {
  assertCommutativeMonoid(op.descriptor, 'Arr.reduce')
  const source = toNode(list)
  const element = elementAst(source)
  return wrap(
    rowsOver('reduce', source, {
      op: op.descriptor,
      value: bodyOf(element, value as Body, 'Arr.reduce'),
      ...(test === undefined ? {} : { where: bodyOf(element, test as Body, 'Arr.reduce') }),
    }),
  )
}

/** The greatest `value` of the elements that pass `test`: null over none, skipping a null value. */
export const max: NumericFold<number | null> = /* @__PURE__ */ numeric('max') as NumericFold<
  number | null
>

/** The first element that passes `test`, or `value` of it: null where none does. */
export function find<L extends NullableItems, R extends ExprInput<never, boolean | null>>(
  list: L,
  test: (each: Each<ElementOf<L>>) => R,
): Expr<EnvOfInput<L> & Outside<EnvOfInput<R>>, ElementOf<L> | null>
export function find<
  L extends NullableItems,
  R extends ExprInput<never, boolean | null>,
  V extends ExprInput<never, unknown>,
>(
  list: L,
  test: (each: Each<ElementOf<L>>) => R,
  value: (each: Each<ElementOf<L>>) => V,
): Expr<
  EnvOfInput<L> & Outside<EnvOfInput<R>> & Outside<EnvOfInput<V>>,
  Exclude<V extends ExprInput<never, infer A> ? A : never, null> | null
>
export function find(
  list: NullableItems,
  test: (each: Each<unknown>) => unknown,
  value?: (each: Each<unknown>) => unknown,
): Expr<unknown, unknown> {
  return wrap(fold('find')(list, { test, value }))
}

/** The elements that pass `test`, in order; the list itself where every one does. */
export const keep = <L extends NullableItems, R extends ExprInput<never, boolean | null>>(
  list: L,
  test: (each: Each<ElementOf<L>>) => R,
): Expr<EnvOfInput<L> & Outside<EnvOfInput<R>>, ReadonlyArray<ElementOf<L>> | NullOf<L>> =>
  wrap(fold('keep')(list, { test: test as (each: Each<unknown>) => R }))

/** True when `items` has zero elements. */
export const isEmpty = <A extends NullableItems>(
  items: A,
): Expr<EnvOfInput<A>, boolean | NullOf<A>> => call(isEmptyOp, [items])

/** True when `items` (a list of scalars) contains `value`. */
export const has = <
  L extends NullableItems,
  V extends ExprInput<never, number | string | boolean | null>,
>(
  items: L,
  value: V,
): Expr<EnvOfInput<L> & EnvOfInput<V>, boolean | NullOf<L> | NullOf<V>> =>
  call(hasOp, [items, value])

/** Derived helper: `Bool.not(Arr.isEmpty(items))`. */
export const nonEmpty = <A extends NullableItems>(
  items: A,
): Expr<EnvOfInput<A>, boolean | NullOf<A>> => call(Bool.notOp, [isEmpty(items)])
