/**
 * `Data.can` (#533): whether a declared write would be refused, told from what
 * the Model holds, in the server's order: a held `may`, the `when`, then the
 * invariants of the row the write leaves.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Derived, Entity, Expr, Write } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Can, Mutation, Remote } from '../src/index.js'

const Doc = Entity.define(
  'Doc',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    status: Schema.Literals(['draft', 'published', 'archived']),
    size: Schema.Number,
  }),
).pipe(
  Entity.derived({
    gate: Derived.make(
      Schema.Struct({ locked: Schema.Boolean, quiet: Schema.optionalKey(Schema.Boolean) }),
      {
        forbids: value =>
          Schema.is(Schema.Struct({ locked: Schema.Literal(false) }))(value)
            ? Option.none()
            : Option.some({
                // A quiet gate refuses without words.
                reason: Schema.is(Schema.Struct({ quiet: Schema.Literal(true) }))(value)
                  ? Option.none()
                  : Option.some('It is locked.'),
              }),
      },
    ),
  }),
  Entity.invariant('small', ({ after }) => Expr.lte(after.size, 10), {
    message: 'It stays small',
    path: ['size'],
  }),
  Entity.invariant(
    'staysPublished',
    ({ before, after }) =>
      Expr.or(
        Expr.not(Expr.eq(before.status, 'published')),
        Expr.not(Expr.eq(after.status, 'draft')),
      ),
    { message: 'A published doc does not go back to draft', path: ['status'] },
  ),
)

const Publish = Mutation.write(
  'Publish',
  Write.update(
    Entity.input(Doc, Schema.Struct({ id: Schema.String, status: Schema.Literal('published') })),
    { id: 'id', when: () => Expr.eq(Doc.fields.status, 'draft') },
  ),
)
const Revert = Mutation.write(
  'Revert',
  Write.update(
    Entity.input(Doc, Schema.Struct({ id: Schema.String, status: Schema.Literal('draft') })),
    {
      id: 'id',
    },
  ),
)
/** A `when` that reads the input: the status the caller saw. */
const PublishSeen = Mutation.write(
  'PublishSeen',
  Write.update(
    Entity.input(
      Doc,
      Schema.Struct({
        id: Schema.String,
        status: Schema.Literal('published'),
        seen: Schema.Literals(['draft', 'published', 'archived']),
      }),
      { seen: Entity.unmapped },
    ),
    { id: 'id', when: ({ input }) => Expr.eq(Doc.fields.status, input.seen) },
  ),
)
const Grow = Mutation.write(
  'Grow',
  Write.update(
    Entity.input(Doc, Schema.Struct({ id: Schema.String, amount: Schema.Int }), {
      amount: Entity.unmapped,
    }),
    { id: 'id', increment: { size: 'amount' } },
  ),
)
const Resize = Mutation.write(
  'Resize',
  Write.update(Entity.input(Doc, Schema.Struct({ id: Schema.String, size: Schema.Number })), {
    id: 'id',
  }),
)
const Retitle = Mutation.write(
  'Retitle',
  Write.update(Entity.input(Doc, Schema.Struct({ id: Schema.String, title: Schema.String })), {
    id: 'id',
  }),
)
const Drop = Mutation.write(
  'Drop',
  Write.delete(Entity.input(Doc, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)
const Hand = Mutation.make('Hand', {
  Input: Schema.Struct({ id: Schema.String }),
  Output: Schema.Struct({}),
})

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Doc],
  mutations: [Publish, Revert, PublishSeen, Grow, Resize, Retitle, Drop, Hand],
})

const read = (
  rows: ReadonlyArray<Readonly<Record<string, unknown> & { readonly id: string }>>,
  fields: ReadonlyArray<string>,
): Model =>
  Data.reduce(
    { remote: Remote.initial },
    {
      _tag: 'ReadReceived',
      requests: rows.map(row => ({ entity: 'Doc', id: row.id, fields: [...fields] })),
      result: {
        settled: [],
        entities: rows.map(row => ({ entity: 'Doc', id: row.id, values: row })),
      },
      now: 0,
    },
  )

const all = ['id', 'title', 'status', 'size', 'gate']
const held = read(
  [
    { id: 'draft', title: 'A', status: 'draft', size: 1, gate: { locked: false } },
    { id: 'live', title: 'B', status: 'published', size: 9, gate: { locked: false } },
    { id: 'gone', title: 'C', status: 'archived', size: 1, gate: { locked: false } },
    { id: 'locked', title: 'D', status: 'draft', size: 1, gate: { locked: true } },
    { id: 'lockedLive', title: 'F', status: 'published', size: 1, gate: { locked: true } },
    { id: 'hushed', title: 'G', status: 'draft', size: 1, gate: { locked: true, quiet: true } },
  ],
  all,
)
/** Rows held without the field a `when` or an invariant reads. */
const partial = read([{ id: 'bare', title: 'E' }], ['id', 'title'])

const tag = (answer: Can) =>
  Can.match(answer, { Yes: () => 'Yes', No: () => 'No', Undecided: () => 'Undecided' })
const refusal = (answer: Can) =>
  Can.match(answer, {
    Yes: () => undefined,
    No: ({ refusal: why }) => why,
    Undecided: () => undefined,
  })

describe('Data.can', () => {
  it('answers Yes for a draft the when admits and no invariant breaks', () => {
    expect(Data.can(held, Publish, { id: 'draft', status: 'published' })).toEqual(Can.Yes({}))
  })

  it('answers No(Unmet) where the row does not hold what the when asks', () => {
    for (const id of ['live', 'gone'])
      expect(refusal(Data.can(held, Publish, { id, status: 'published' }))).toEqual({
        _tag: 'Unmet',
      })
  })

  it('answers No(Invalid) naming the invariant a write would break', () => {
    expect(refusal(Data.can(held, Revert, { id: 'live', status: 'draft' }))).toMatchObject({
      _tag: 'Invalid',
      entity: 'Doc',
      rule: 'staysPublished',
      message: 'A published doc does not go back to draft',
      path: ['status'],
    })
  })

  it('answers No(Forbidden) with the held gate words, before the when and the invariants', () => {
    expect(refusal(Data.can(held, Publish, { id: 'locked', status: 'published' }))).toEqual({
      _tag: 'Forbidden',
      reason: Option.some('It is locked.'),
    })
    expect(tag(Data.can(held, Drop, { id: 'locked' }))).toBe('No')
    // Its when and its invariant would refuse it too: the gate answers first.
    expect(
      refusal(Data.can(held, Publish, { id: 'lockedLive', status: 'published' })),
    ).toMatchObject({
      _tag: 'Forbidden',
    })
    expect(refusal(Data.can(held, Revert, { id: 'lockedLive', status: 'draft' }))).toMatchObject({
      _tag: 'Forbidden',
    })
  })

  it('answers Unmet before Invalid when both would refuse', () => {
    const both = read(
      [{ id: 'x', title: 'X', status: 'published', size: 99, gate: { locked: false } }],
      all,
    )
    expect(refusal(Data.can(both, Publish, { id: 'x', status: 'published' }))).toEqual({
      _tag: 'Unmet',
    })
  })

  it('answers Undecided where the row is not held, with the reason', () => {
    expect(Data.can(held, Publish, { id: 'nobody', status: 'published' })).toEqual(
      Can.Undecided({ reasons: ['Doc nobody is not held'] }),
    )
  })

  it('answers Undecided where the row lacks a field the when reads', () => {
    const answer = Data.can(partial, Publish, { id: 'bare', status: 'published' })
    expect(tag(answer)).toBe('Undecided')
  })

  it('answers Undecided naming a may member the client holds no value of', () => {
    const ungated = read(
      [{ id: 'u', title: 'U', status: 'draft', size: 1 }],
      ['id', 'title', 'status', 'size'],
    )
    for (const answer of [
      Data.can(ungated, Publish, { id: 'u', status: 'published' }),
      Data.can(ungated, Drop, { id: 'u' }),
    ])
      expect(answer).toEqual(
        Can.Undecided({
          reasons: ['the client holds no Doc.gate, which a rule may refuse the write by'],
        }),
      )
    // A held gate that refuses still answers No: only a missing one is undecided.
    expect(tag(Data.can(held, Publish, { id: 'draft', status: 'published' }))).toBe('Yes')
  })

  it('answers Undecided without the id', () => {
    expect(Data.can(held, Publish, {})).toEqual(Can.Undecided({ reasons: ['id is not given'] }))
  })

  it('answers Undecided where an input key the when reads is not given, and decides once it is', () => {
    const asked = Data.can(held, PublishSeen, { id: 'draft', status: 'published' })
    expect(asked).toMatchObject({ _tag: 'Undecided' })
    expect(
      Data.can(held, PublishSeen, { id: 'draft', status: 'published', seen: 'draft' }),
    ).toEqual(Can.Yes({}))
    expect(
      refusal(Data.can(held, PublishSeen, { id: 'draft', status: 'published', seen: 'archived' })),
    ).toEqual({ _tag: 'Unmet' })
  })

  it('judges the invariants over the row as it would be with the keys given', () => {
    expect(tag(Data.can(held, Resize, { id: 'live', size: 10 }))).toBe('Yes')
    expect(refusal(Data.can(held, Resize, { id: 'live', size: 11 }))).toMatchObject({
      _tag: 'Invalid',
      rule: 'small',
    })
    // The size left out writes nothing: the row as it is satisfies `small`.
    expect(tag(Data.can(held, Resize, { id: 'live' }))).toBe('Yes')
  })

  it('answers Undecided over a field the write moves by an amount, which the client does not work out', () => {
    expect(Data.can(held, Grow, { id: 'live', amount: 5 })).toMatchObject({ _tag: 'Undecided' })
  })

  it('answers Undecided where an invariant reads a field the row does not hold', () => {
    expect(Data.can(partial, Retitle, { id: 'bare', title: 'F' })).toMatchObject({
      _tag: 'Undecided',
    })
  })

  it('refuses a mutation that is not a declared Write, and an unregistered one', () => {
    expect(() => Data.can(held, Hand, { id: 'draft' })).toThrow('not declared as a Write')
  })

  it('returns what the Model held and changes nothing', () => {
    const before = JSON.stringify(held)
    Data.can(held, Publish, { id: 'draft', status: 'published' })
    expect(JSON.stringify(held)).toBe(before)
  })
})

interface Caller {
  readonly name: string
}

/** A capability over Publish, its input made from the agent call's own. */
const publish = Data.capability(Publish, ({ input }: { input: { readonly id: string } }) => ({
  id: input.id,
  status: 'published',
}))
const call = (id: string) => ({ model: held, input: { id }, principal: { name: 'agent' } })

describe('Data.capability', () => {
  it('allows both where the write would be accepted', () => {
    expect(publish.authorize(call('draft'))).toBe(true)
    expect(publish.applies(call('draft'))).toBe(true)
  })

  it('refuses a held may in authorize, with its words, and only there', () => {
    expect(publish.authorize(call('locked'))).toEqual({ allowed: false, reason: 'It is locked.' })
    // Its when would refuse too: authorize answers for the gate alone.
    expect(publish.authorize(call('lockedLive'))).toEqual({
      allowed: false,
      reason: 'It is locked.',
    })
  })

  it('refuses a may without words as a plain refusal', () => {
    expect(publish.authorize(call('hushed'))).toBe(false)
  })

  it('leaves the state of a row out of authorize', () => {
    for (const id of ['live', 'gone']) expect(publish.authorize(call(id))).toBe(true)
  })

  it('refuses a when that does not hold in applies, naming the row and the write', () => {
    expect(publish.applies(call('gone'))).toEqual({
      applies: false,
      reason: 'Doc gone does not hold what Publish asks of it',
    })
  })

  it('refuses a broken invariant in applies with its message', () => {
    const revert = Data.capability(Revert, ({ input }: { input: { readonly id: string } }) => ({
      id: input.id,
      status: 'draft',
    }))
    expect(revert.authorize(call('live'))).toBe(true)
    expect(revert.applies(call('live'))).toEqual({
      applies: false,
      reason: 'A published doc does not go back to draft',
    })
  })

  it('allows what the client cannot decide, which the server then does', () => {
    expect(publish.authorize(call('nobody'))).toBe(true)
    expect(publish.applies(call('nobody'))).toBe(true)
  })

  it('makes the input from the whole call, judged over the Model it carries', () => {
    const asked: Array<unknown> = []
    const checks = Data.capability(
      Publish,
      (request: { model: Model; input: { readonly id: string }; principal: Caller }) => {
        asked.push(request)
        return { id: request.input.id, status: 'published' }
      },
    )
    const request = { model: held, input: { id: 'draft' }, principal: { name: 'agent' } }
    checks.applies(request)
    expect(asked).toEqual([request])
    // The same id over a Model where it is published.
    const published = read(
      [{ id: 'draft', title: 'A', status: 'published', size: 1, gate: { locked: false } }],
      all,
    )
    expect(checks.applies({ ...request, model: published })).toMatchObject({ applies: false })
  })

  it('refuses at declaration a mutation that is not a declared Write', () => {
    expect(() => Data.capability(Hand, () => ({ id: 'x' }))).toThrow(
      'Data.capability(Hand): the mutation was not declared as a Write',
    )
  })
})

describe('Data.available', () => {
  const over = (id: Option.Option<string>) =>
    Data.available(Publish, () => Option.map(id, each => ({ id: each, status: 'published' })))

  it('is true while the write over the named row would be accepted', () => {
    expect(over(Option.some('draft'))(held)).toBe(true)
  })

  it('is false while Data.can answers No, for any refusal', () => {
    for (const id of ['live', 'gone', 'locked']) expect(over(Option.some(id))(held)).toBe(false)
  })

  it('is true where the client cannot decide', () => {
    expect(over(Option.some('nobody'))(held)).toBe(true)
  })

  it('is false while the Model names no row', () => {
    expect(over(Option.none())(held)).toBe(false)
  })

  it('refuses at declaration a mutation that is not a declared Write', () => {
    expect(() => Data.available(Hand, () => Option.none())).toThrow(
      'Data.available(Hand): the mutation was not declared as a Write',
    )
  })
})
