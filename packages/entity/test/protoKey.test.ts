/**
 * A field named `__proto__`: assigning it to a plain object sets the object's
 * prototype rather than a key, so a record built so loses it (#329, #330).
 */
import { Effect, Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Expr,
  Held,
  Operators,
  Order,
  Query,
  Relation,
  Write,
  evaluate,
  type Expr as ExprOf,
} from '../src/index.js'

const PROTO = '__proto__'
// Built from entries: a `__proto__` key in an object literal sets the prototype instead.
const Odd = Entity.define(
  'Odd',
  Schema.Struct(
    Object.fromEntries([
      ['id', Schema.String],
      [PROTO, Schema.Int],
      ['note', Schema.String],
    ]) as { readonly id: typeof Schema.String; readonly note: typeof Schema.String },
  ),
)
const proto = Object.getOwnPropertyDescriptor(Odd.fields, PROTO)!.value as typeof Odd.fields.id
const ownValue = (record: object, key: string): unknown =>
  Object.getOwnPropertyDescriptor(record, key)?.value

const Positive = Odd.pipe(
  Entity.invariant(
    'positive',
    ({ after }) => Expr.gt(ownValue(after, PROTO) as ExprOf<number>, 0),
    {
      message: 'must be positive',
    },
  ),
)

describe('a field named __proto__', () => {
  it('is judged from an input that maps a key to it (#330)', () => {
    const edit = (Entity.input as (...args: ReadonlyArray<unknown>) => never)(
      Positive,
      Schema.Struct({ id: Schema.String, value: Schema.Int }),
      { value: proto },
    )
    expect(Entity.judgeInput(edit, { id: 'a', value: -1 })._tag).toBe('Invalid')
    expect(Entity.judgeInput(edit, { id: 'a', value: 1 })._tag).toBe('Valid')
  })

  it('is judged by the Schema check (#330)', () => {
    const checked = Positive.schema.check(Entity.check(Positive))
    const row = Object.fromEntries([
      ['id', 'a'],
      [PROTO, -1],
      ['note', 'n'],
    ])
    expect(() => Schema.decodeUnknownSync(checked)(row)).toThrow('must be positive')
  })

  const inputOf = (fields: Schema.Struct.Fields, mapping: object) =>
    (Entity.input as (...args: ReadonlyArray<unknown>) => never)(
      Odd,
      Schema.Struct({ id: Schema.String, ...fields }),
      mapping,
    )
  const update = Write.update as (...args: ReadonlyArray<unknown>) => never

  it('keeps its increment and value when a write is bound (#329)', () => {
    const bump = update(inputOf({ by: Schema.Int }, { by: Entity.unmapped }), {
      id: 'id',
      increment: { [PROTO]: 'by' },
    })
    expect(ownValue(Write.bind(bump, { id: 'x', by: 2 } as never).increments, PROTO)).toBe(2)
    const set = update(inputOf({ level: Schema.Int }, { level: proto }), { id: 'id' })
    expect(ownValue(Write.bind(set, { id: 'x', level: 3 } as never).values, PROTO)).toBe(3)
  })

  it('keeps what a bound write leaves in the row it computes (#329)', () => {
    const before = Object.fromEntries([
      ['id', 'x'],
      [PROTO, 1],
    ])
    const increments = Object.fromEntries([[PROTO, 2]])
    const { row, unknown } = Write.apply(
      before,
      { values: {}, increments, assignments: {} },
      { operators: Operators.kernel },
    )
    expect(unknown).toEqual([])
    expect(ownValue(row, PROTO)).toBe(3)
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype)
  })
})

// The rest of the sweep: each a lookup or a record keyed by a caller's name.
describe('a name Object.prototype holds, elsewhere', () => {
  const Doc = Entity.define('Doc', Schema.Struct({ id: Schema.String }))

  it('reads an input left out as absent, not as the inherited value', () => {
    const unset = Query.from(Doc).pipe(
      Query.where(Expr.isNull(Expr.input('constructor', Schema.NullOr(Schema.String)))),
    )
    expect(evaluate(unset, {}, [{ id: 'a' }])).toEqual([{ id: 'a' }])
  })

  it('chooses no order for a sort input left out', () => {
    const sort = Expr.input(
      'constructor',
      Schema.NullOr(Schema.Struct({ by: Schema.Literal('id'), direction: Schema.Literal('asc') })),
    )
    const sorted = Query.from(Doc).pipe(Query.orderBy(Order.chosen(sort, { id: Doc.fields.id })))
    expect(Query.orderFor(sorted, {})).toEqual([Order.asc(Doc.fields.id)])
  })

  it('relates an Entity keyed __proto__, and refuses relations for one not related', () => {
    const relate = Entity.relate as (...args: ReadonlyArray<unknown>) => Record<string, unknown>
    const related = relate(Object.fromEntries([[PROTO, Doc]]), {})
    expect(ownValue(related, PROTO)).toMatchObject({ name: 'Doc' })
    expect(() => relate({ Doc }, { toString: {} })).toThrow(
      'relations given for "toString", which is not being related',
    )
  })

  it('sets a field named __proto__', () => {
    const Stamped = Entity.define(
      'Stamped',
      Schema.Struct(
        Object.fromEntries([
          ['id', Schema.String],
          [PROTO, Schema.Number],
        ]) as { readonly id: typeof Schema.String },
      ),
    )
    const sets = Entity.sets as (...args: ReadonlyArray<unknown>) => (entity: unknown) => {
      readonly sets: object
    }
    expect(
      Object.hasOwn(
        sets(Object.fromEntries([[PROTO, Expr.now]]), { on: 'create' })(Stamped).sets,
        PROTO,
      ),
    ).toBe(true)
  })

  it('reads a link a row leaves out as absent', () => {
    const User = Entity.define('User', Schema.Struct({ id: Schema.String }))
    const { Post } = Entity.relate(
      { User, Post: Entity.define('Post', Schema.Struct({ id: Schema.String })) },
      { Post: { constructor: Relation.one(User, { optional: true }) } },
    )
    const linked = Query.from(Post).pipe(Query.where(Expr.isNull(Post.relations.constructor)))
    expect(Held.fromRefs(linked, { id: 'p' })).toEqual({ id: 'p' })
  })
})

describe('a write over members named __proto__ (#329)', () => {
  const User = Entity.define('User', Schema.Struct({ id: Schema.String }))
  const Fields = Entity.define(
    'Task',
    Schema.Struct(
      Object.fromEntries([
        ['id', Schema.String],
        [PROTO, Schema.Number],
        ['note', Schema.String],
      ]) as { readonly id: typeof Schema.String; readonly note: typeof Schema.String },
    ),
  )
  const relate = Entity.relate as (
    ...args: ReadonlyArray<unknown>
  ) => Readonly<Record<string, { readonly relations: object }>>
  // The relation is a Doc's: a Task already holds a field of that name.
  const Linked = relate(
    { User, Doc: Entity.define('Doc', Schema.Struct({ id: Schema.String })) },
    { Doc: Object.fromEntries([[PROTO, Relation.one(User, { optional: true })]]) },
  ).Doc!
  const relation = ownValue(Linked.relations, PROTO)
  const input = (entity: unknown, fields: Schema.Struct.Fields, mapping: object) =>
    (Entity.input as (...args: ReadonlyArray<unknown>) => never)(
      entity,
      Schema.Struct({ id: Schema.String, ...fields }),
      mapping,
    )
  const update = Write.update as (...args: ReadonlyArray<unknown>) => never
  const insert = Write.insert as (...args: ReadonlyArray<unknown>) => never
  const sets = Entity.sets as (...args: ReadonlyArray<unknown>) => (entity: unknown) => unknown

  it('binds a link and a computed assignment under it', () => {
    const relink = update(
      input(Linked, { owner: Schema.String }, { owner: Relation.input(relation as never) }),
      {
        id: 'id',
      },
    )
    const links = Write.bind(relink, { id: 'd', owner: 'u' } as never).links
    expect(ownValue(links, PROTO)).toEqual(Option.some({ entity: 'User', id: 'u' }))
    const five = update(input(Fields, {}, {}), {
      id: 'id',
      compute: Object.fromEntries([[PROTO, () => Expr.literal(5)]]),
    })
    const bound = Write.bind(five, { id: 'x' } as never)
    const { row } = Write.apply({ id: 'x' }, bound, { operators: Operators.kernel })
    expect(ownValue(row, PROTO)).toBe(5)
  })

  it('reads an input key left out as absent', () => {
    const edit = update(
      input(
        Fields,
        { constructor: Schema.optional(Schema.String) },
        { constructor: Fields.fields.note },
      ),
      { id: 'id' },
    )
    expect(Write.bind(edit, { id: 'x' } as never).values).toEqual({})
  })

  it('refuses a key of no input where a write names one', () => {
    const plain = input(Fields, { by: Schema.Number }, { by: Entity.unmapped })
    expect(() => update(plain, { id: 'id', expect: 'constructor' })).toThrow(
      '"constructor" is not a key of the input',
    )
    expect(() =>
      update(plain, { id: 'id', increment: Object.fromEntries([[PROTO, 'constructor']]) }),
    ).toThrow('"constructor" is not a key of the input')
  })

  it('fills a value and a link the context sets under it', () => {
    const now = (
      sets(Object.fromEntries([[PROTO, Expr.now]]), { on: 'create' }) as (e: unknown) => unknown
    )(Fields)
    const stamp = insert(input(now, {}, {}), { id: 'id' })
    const by = { viewer: Option.some({ entity: 'User', id: 'u' }), now: Option.some(7) }
    const unheld = () => Effect.succeed(Held.unheld('no row'))
    expect(ownValue(Effect.runSync(Write.contextValues(stamp, by, unheld)).values, PROTO)).toBe(7)
    const owned = sets(Object.fromEntries([[PROTO, Expr.viewer(User)]]), { on: 'create' })(Linked)
    const own = insert(input(owned, {}, {}), { id: 'id' })
    expect(ownValue(Effect.runSync(Write.contextValues(own, by, unheld)).links, PROTO)).toEqual(
      Option.some({ entity: 'User', id: 'u' }),
    )
  })
})
