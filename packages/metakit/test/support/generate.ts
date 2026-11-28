import { Arr, Bool, Eq, Expr, Null, Num, Ord, Path, Str } from '@doeixd/metakit'
import { Text } from '@doeixd/metakit/domain'
import { Schema } from 'effect'

const Status = Schema.Literals(['open', 'closed'])
const Fixture = Schema.Struct({
  int: Schema.Int,
  finite: Schema.Finite,
  number: Schema.Number,
  text: Text.schema,
  string: Schema.String,
  flag: Schema.Boolean,
  nullable: Schema.NullOr(Schema.Int),
  optional: Schema.optionalKey(Schema.Int),
  status: Status,
  items: Schema.Array(Schema.Int),
})
type Env = typeof Fixture.Type
type Numeric = Expr.Expr<Env, number | null>
type Textual = Expr.Expr<Env, string | null>
type BooleanExpression = Expr.Expr<Env, boolean | null>
type Generated = {
  readonly expr: Expr.Expr<Env, number | string | boolean | Env['items'] | Env | null>
  readonly env: Env
}

const $ = Path.forSchema(Fixture)
const max = Number.MAX_SAFE_INTEGER
const integers = [0, -0, 1, -1, 2, -7, max, -max]
const finiteNumbers = [...integers, 0.5, -2.25]
const numbers = [...finiteNumbers, NaN]
const texts = ['', 'a', ' A ', 'b', '🚀', '\uD800', '�']
const strings = [...texts, '\u0000', 'a\u0000b']
const flags = [true, false]

// Mulberry32, as in sql-parity.test.ts.
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Generate reproducible expressions of depth at most five and Schema-valid environments. */
export const generate = (seed: number, count: number): ReadonlyArray<Generated> => {
  const random = seeded(seed)
  const pick = <A>(pool: ReadonlyArray<A>): A => pool[Math.floor(random() * pool.length)]!

  const environment = (): Env => ({
    int: pick(integers),
    finite: pick(finiteNumbers),
    number: pick(numbers),
    text: pick(texts),
    string: pick(strings),
    flag: pick(flags),
    nullable: pick([null, ...integers]),
    ...(random() < 0.5 ? {} : { optional: pick(integers) }),
    status: pick(Status.literals),
    items: Array.from({ length: Math.floor(random() * 5) }, () => pick(integers)),
  })

  const numericLeaf = (): Numeric =>
    pick<Numeric>([
      $.int,
      $.finite,
      $.number,
      $.nullable,
      $.optional,
      Expr.lit(pick(finiteNumbers)),
    ])
  const textLeaf = (): Textual => pick<Textual>([$.text, $.string, Expr.lit(pick(texts))])

  const numeric = (depth: number): Numeric => {
    if (depth === 0) return numericLeaf()
    const child = () => numeric(depth - 1)
    return pick<() => Numeric>([
      numericLeaf,
      () => Num.add(child(), child()),
      () => Num.sub(child(), child()),
      () => Num.mul(child(), pick([0, 1, 2])),
      () => Num.neg(child()),
      () => Null.coalesce(child(), child()),
      () => Str.len(textual(depth - 1)),
      () => Arr.count($.items),
      () => Expr.when(predicate(depth - 1), { then: child(), else: child() }),
      () => Expr.match($.status, { open: child(), closed: child() }),
      () => Expr.matchOrElse($.string, { a: child() }, child()),
    ])()
  }

  const textual = (depth: number): Textual => {
    if (depth === 0) return textLeaf()
    const child = () => textual(depth - 1)
    return pick<() => Textual>([
      textLeaf,
      () => Str.concat(child(), child()),
      () => Str.lowerAscii(child()),
      () => Str.trim(child()),
      () => Expr.when(predicate(depth - 1), { then: child(), else: child() }),
    ])()
  }

  const predicate = (depth: number): BooleanExpression => {
    if (depth === 0) return pick<BooleanExpression>([$.flag, Expr.lit(pick(flags))])
    const child = () => predicate(depth - 1)
    const number = () => numeric(depth - 1)
    const text = () => textual(depth - 1)
    return pick<() => BooleanExpression>([
      () => Ord.lt(number(), number()),
      () => Ord.gte(number(), number()),
      () => Eq.equals(number(), number()),
      () => Eq.is($.number, $.number),
      () => Eq.is(text(), text()),
      () => Bool.and(child(), child()),
      () => Bool.or(child(), child()),
      () => Bool.not(child()),
      () => Null.isNull(number()),
      () => Str.contains(text(), text()),
      () => Expr.when(child(), { then: child(), else: child() }),
      ...(depth > 1
        ? [
            () => Arr.any($.items, item => Ord.lt(item, numeric(depth - 2))),
            () => Arr.every($.items, item => Ord.gte(item, numeric(depth - 2))),
          ]
        : []),
    ])()
  }

  return Array.from({ length: count }, () => {
    const env = environment()
    const depth = pick([1, 2, 3, 4, 5])
    const expr = pick<() => Generated['expr']>([
      () => numeric(depth),
      () => predicate(depth),
      () => textual(depth),
      () => $.items,
      () => $,
    ])()
    return { expr, env }
  })
}
