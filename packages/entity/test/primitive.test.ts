/**
 * Primitive operators: each interpreter implements them, here through a table
 * of in-memory implementations. See `docs/design/expr-operations-DESIGN.md` §5.4.
 */
import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Collation,
  Entity,
  Expr,
  OperatorMissingError,
  Operators,
  Query,
  QueryEvaluateError,
  Text,
  decided,
  evaluate,
  truthOver,
  type Expr as ExprOf,
  type Predicate,
} from '../src/index.js'

const Item = Entity.define(
  'Item',
  Schema.Struct({
    id: Schema.String,
    code: Schema.String,
    note: Schema.NullOr(Schema.String),
    name: Schema.String,
    title: Schema.String,
  }),
).pipe(
  Entity.annotateMembers({
    code: Collation.of(Collation.binary),
    name: Collation.of(Collation.asciiFold),
    title: Collation.of(Collation.locale('en_US')),
  }),
)
const { fields } = Item

/** Text after text, under the collation its operands share. */
const joined = Expr.operator('acme.joined', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
  collation: 'operands',
})
const joinedLive = Operators.implement(joined, (left, right) => `${left}${right}`)

/** Whether a value is absent or blank, answering for null itself. */
const blank = Expr.operator('acme.blank', {
  input: [Schema.NullOr(Schema.String)],
  output: Schema.Boolean,
  nulls: 'handled',
})
const blankLive = Operators.implementHandlingNulls(blank, value =>
  value === null ? true : value.trim() === '',
)

const rows = [
  { id: 'i1', code: 'AB-1', note: null, name: 'Bolt', title: 'A' },
  { id: 'i2', code: 'ab-2', note: '  ', name: 'bolt cutter', title: 'B' },
  { id: 'i3', code: 'AB-3', note: 'kept', name: 'Nut', title: 'C' },
]
const ids = (body: Query<typeof Item>, operators = Operators.kernel) =>
  evaluate(body, {}, rows, { operators }).map(row => row['id'])
const where = (predicate: Predicate) => Query.from(Item).pipe(Query.where(predicate))

describe('A primitive operator', () => {
  it('runs through the table given, and is refused by name without it', () => {
    const body = where(Expr.eq(joined(fields.code, '!'), 'AB-1!'))
    expect(ids(body, Operators.memory(joinedLive))).toEqual(['i1'])
    expect(() => ids(body)).toThrow('this interpreter does not run acme.joined')
    expect(Query.unsupported(body, ['eq'])).toEqual(['acme.joined'])
    expect(Query.unsupported(body, ['eq'], Operators.memory(joinedLive))).toEqual([])
  })

  it('is refused by the class a judge reads as undecided, naming the operator', () => {
    const body = where(Expr.eq(joined(fields.code, '!'), 'x'))
    expect(() => truthOver(body.where[0]!, rows[0]!, {}, {}, Operators.memory())).toThrow(
      OperatorMissingError,
    )
  })

  it('gives null for a null argument when strict, never asking the implementation', () => {
    let asked = 0
    const counting = Operators.memory(
      Operators.implement(joined, (left, right) => {
        asked += 1
        return `${left}${right}`
      }),
    )
    // `note` is null in i1: null joined is null, and null = 'x' is unknown.
    const nullable = Expr.operator('acme.joinedNullable', {
      input: [Schema.NullOr(Schema.String), Schema.String],
      output: Schema.NullOr(Schema.String),
    })
    const table = Operators.merge(
      counting,
      Operators.memory(Operators.implement(nullable, (left, right) => `${left}${right}`)),
    )
    expect(ids(where(Expr.isNull(nullable(fields.note, '!'))), table)).toEqual(['i1'])
    expect(asked).toBe(0)
  })

  it('hands nulls to an implementation that handles them, and reads its null as unknown', () => {
    const table = Operators.memory(blankLive)
    expect(ids(where(blank(fields.note)), table)).toEqual(['i1', 'i2'])
    const unsure = Operators.override(
      table,
      Operators.implementHandlingNulls(blank, () => null),
    )
    expect(ids(where(Expr.not(blank(fields.note))), unsure)).toEqual([])
  })

  it('refuses text holding a NUL before the implementation sees it', () => {
    const body = where(Expr.eq(joined(fields.code, `a${String.fromCharCode(0)}`), 'x'))
    expect(() => ids(body, Operators.memory(joinedLive))).toThrow(
      'the operator "acme.joined" was given text holding a NUL character',
    )
  })

  it('names itself when its implementation throws', () => {
    const table = Operators.memory(
      Operators.implement(joined, () => {
        throw new Error('boom')
      }),
    )
    expect(() => ids(where(Expr.eq(joined(fields.code, '!'), 'x')), table)).toThrow(
      'the operator "acme.joined" failed: boom',
    )
  })

  it('has its answer held to its output schema by a checked table', () => {
    const wrong = Operators.memory(
      // @ts-expect-error a number is not the text it gives
      Operators.implement(joined, () => 7),
    )
    const body = where(Expr.eq(joined(fields.code, '!'), 'x'))
    expect(() => ids(body, wrong)).not.toThrow()
    expect(() => ids(body, Operators.checked(wrong))).toThrow(
      'the operator "acme.joined" answered 7, which its output schema does not admit',
    )
  })

  it('refuses a predicate answering something that is not a truth', () => {
    const table = Operators.memory(
      // @ts-expect-error text is not the truth it gives
      Operators.implementHandlingNulls(blank, () => 'yes'),
    )
    expect(() => ids(where(blank(fields.note)), table)).toThrow('which is not a truth')
  })
})

describe('Deciding a call over the input alone', () => {
  it('runs it with the table given', () => {
    const asked = Expr.eq(joined(Expr.input('a', Schema.String), 'b'), 'ab')
    expect(decided(asked, { a: 'a' }, Operators.memory(joinedLive))).toEqual(Option.some(true))
    expect(() => decided(asked, { a: 'a' })).toThrow(OperatorMissingError)
  })
})

describe('A defined operator', () => {
  it('runs what it means, and takes no implementation, which SQL would never run', () => {
    const named = Expr.operator('acme.named', {
      input: [Schema.String],
      output: Schema.Boolean,
      definedAs: name => Expr.eq(name, 'Nut'),
    })
    expect(ids(where(named(fields.name)))).toEqual(['i3'])
    expect(() => Operators.implement(named, name => name === 'Bolt')).toThrow(
      'acme.named is defined by an expression, which every interpreter runs; it takes no implementation',
    )
  })
})

describe('A call carrying a collation', () => {
  it("takes its operands' shared one, so its text compares under it", () => {
    const table = Operators.memory(joinedLive)
    // `code` is binary: 'ab-2' + '!' does not reach 'AB-' + '2!' and above.
    const body = where(Expr.gte(joined(fields.code, '!'), 'AB-2!'))
    expect(ids(body, table)).toEqual(['i2', 'i3'])
    expect(joined(fields.code, '!').collation).toEqual(Collation.declared(fields.code.metadata))
  })

  it('carries none when no operand holds one, and its text is then refused in a comparison', () => {
    const bare = joined(Expr.input('a', Schema.String), 'b')
    expect(bare.collation._tag).toBe('None')
    expect(() => Expr.lt(bare, 'x')).toThrow(
      'acme.joined($a, "b") is text with no declared collation',
    )
  })

  it('refuses operands that declare different collations', () => {
    expect(() => joined(fields.code, fields.name)).toThrow('declare different collations')
  })

  it('may be given one, in place of its operands', () => {
    const given = joined(fields.code, '!', { collation: Collation.asciiFold })
    expect(given.collation).toEqual(Collation.declared(fields.name.metadata))
  })
})

describe('Text.startsWith', () => {
  it('compares under its text operand’s collation', () => {
    expect(ids(where(Text.startsWith(fields.code, 'AB')))).toEqual(['i1', 'i3'])
    expect(ids(where(Text.startsWith(fields.name, 'BOLT')))).toEqual(['i1', 'i2'])
  })

  it('is refused over text with no collation, where it is written', () => {
    expect(() => Text.startsWith(fields.note, 'x')).toThrow(
      'Item.note is text with no declared collation',
    )
    // Given one, the same text may be asked.
    expect(() => Text.startsWith(fields.note, 'x', { collation: Collation.binary })).not.toThrow()
  })

  it("is refused under a backend's locale, which only that backend has", () => {
    expect(() =>
      Text.startsWith(fields.code, 'x', { collation: Collation.locale('en_US') }),
    ).toThrow('compares by the backend\'s "en_US" collation')
    // So is text declaring one.
    expect(() => Text.startsWith(fields.title, 'x')).toThrow(
      'compares by the backend\'s "en_US" collation',
    )
  })

  it('takes no vote from a literal or an input, only from text that declares how it compares', () => {
    expect(() => Text.startsWith(Expr.input('text', Schema.String), 'x')).toThrow(
      'compares text with no field or call holding a collation',
    )
  })
})

describe('An operator declaration', () => {
  it('refuses a defined operator declaring a null rule, which is its body’s', () => {
    expect(() =>
      // @ts-expect-error a defined operator means its body, null included
      Expr.operator('acme.wrong', {
        input: [Schema.String],
        output: Schema.Boolean,
        definedAs: (name: ExprOf<string>) => Expr.isNull(name),
        nulls: 'handled',
      }),
    ).toThrow("a defined operator means its body, so `nulls` and `collation` are its body's")
  })

  it('refuses a collation of operands over a result that is not text', () => {
    expect(() =>
      Expr.operator('acme.wrong', {
        input: [Schema.String],
        output: Schema.Number,
        collation: 'operands',
      }),
    ).toThrow("`collation: 'operands'` describes a text result, and this one is not text")
  })

  it('refuses a collation given to a call of an operator comparing no text', () => {
    expect(() => blank(fields.note, { collation: Collation.binary })).toThrow('takes no collation')
  })
})

describe('Operators', () => {
  it('refuses one operator implemented twice, or two under one name', () => {
    expect(() => Operators.memory(joinedLive, joinedLive)).toThrow(
      'acme.joined is implemented twice',
    )
    const twin = Expr.operator('acme.joined', {
      input: [Schema.String, Schema.String],
      output: Schema.String,
    })
    expect(() =>
      Operators.memory(
        joinedLive,
        Operators.implement(twin, (left, right) => left + right),
      ),
    ).toThrow('two operators are named acme.joined')
  })

  it('refuses a merge implementing one operator on both sides, and overrides on request', () => {
    const one = Operators.memory(joinedLive)
    expect(() => Operators.merge(one, Operators.memory(joinedLive))).toThrow(
      'both tables implement acme.joined; replace with Operators.override',
    )
    const shouting = Operators.override(
      one,
      Operators.implement(joined, (left, right) => `${left}${right}`.toUpperCase()),
    )
    expect(ids(where(Expr.eq(joined(fields.code, '!'), 'AB-2!')), shouting)).toEqual(['i2'])
  })

  it('refuses an implementation whose null rule is not its operator’s', () => {
    expect(() => Operators.implement(blank, () => true)).toThrow(
      'handles null itself; implement it with Operators.implementHandlingNulls',
    )
    expect(() => Operators.implementHandlingNulls(joined, () => '')).toThrow(
      'is strict about null; implement it with Operators.implement',
    )
  })

  it('names an operator by its version past the first', () => {
    const later = Expr.operator('acme.later', {
      version: 2,
      input: [Schema.String],
      output: Schema.Boolean,
    })
    expect(Query.unsupported(where(later(fields.code)), ['eq'])).toEqual(['acme.later@2'])
  })
})

describe('An invariant calling an operator the table does not run', () => {
  const Guarded = Entity.define(
    'Guarded',
    Schema.Struct({ id: Schema.String, code: Schema.String }),
  ).pipe(
    Entity.annotateMembers({ code: Collation.of(Collation.binary) }),
    Entity.invariant('coded', ({ after }) => Expr.eq(joined(after.code, '!'), 'AB!'), {
      message: 'Code it',
    }),
  )

  it('is undecided, naming the operator, rather than failing', () => {
    expect(Entity.judge(Guarded, { after: { code: 'AB' } }, Operators.memory())).toEqual({
      _tag: 'Undecided',
      fields: [],
      operators: ['acme.joined'],
    })
  })

  it('is judged where the table runs it', () => {
    const table = Operators.memory(joinedLive)
    expect(Entity.judge(Guarded, { after: { code: 'AB' } }, table)._tag).toBe('Valid')
    expect(Entity.judge(Guarded, { after: { code: 'CD' } }, table)._tag).toBe('Invalid')
  })

  it('is judged from an input, and in a Schema check, with the table each is given', () => {
    const Edit = Entity.input(Guarded, Schema.Struct({ code: Schema.String }))
    const table = Operators.memory(joinedLive)
    expect(Entity.judgeInput(Edit, { code: 'AB' })._tag).toBe('Undecided')
    expect(Entity.judgeInput(Edit, { code: 'CD' }, table)._tag).toBe('Invalid')
    const checked = Guarded.schema.check(Entity.check(Guarded, { operators: table }))
    expect(() => Schema.decodeUnknownSync(checked)({ id: 'g1', code: 'CD' })).toThrow('Code it')
    // A check that cannot run an invariant would pass every value, so it is not made (#327).
    expect(() => Entity.check(Guarded)).toThrow(
      'Entity.check of Guarded: its invariants call acme.joined, which the operator table does not run',
    )
  })

  it('still fails on anything else an evaluation refuses', () => {
    expect(() =>
      Entity.judge(
        Guarded,
        { after: { code: `A${String.fromCharCode(0)}` } },
        Operators.memory(joinedLive),
      ),
    ).toThrow(QueryEvaluateError)
  })
})
