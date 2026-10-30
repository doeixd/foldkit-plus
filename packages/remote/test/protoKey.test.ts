/**
 * Fields named like `Object.prototype`'s members. A field is the application's
 * name, and a read answer repeats it: assigned to a plain object, `__proto__`
 * sets the prototype and adds no key; read from one, `constructor` and
 * `toString` find `Object.prototype`'s functions.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Remote,
  Requirement,
  Selection,
  emptyStore,
  entityKey,
  entry,
  missingFields,
  windowKey,
  writeEntities,
} from '../src/index.js'
import { captureRemote } from '../src/resume.js'

const names = ['__proto__', 'constructor', 'toString'] as const
const key = entityKey('Project', 'p1')
const ownOf = (record: object, name: string): unknown =>
  Object.getOwnPropertyDescriptor(record, name)?.value
const one = <A>(name: string, value: A): Record<string, A> => Object.fromEntries([[name, value]])
const page = (refs: ReadonlyArray<string>, hasNext: boolean, hasPrevious: boolean) => ({
  refs,
  hasNext,
  hasPrevious,
})

const read = (
  store: typeof emptyStore,
  name: string,
  value: unknown,
  window?: { first?: number; after?: string },
) =>
  Remote.writeRead(
    store,
    [
      {
        entity: 'Project',
        id: 'p1',
        fields: [name],
        ...(window === undefined ? {} : { windows: one(name, window) }),
      },
    ],
    { settled: [], entities: [{ entity: 'Project', id: 'p1', values: one(name, value) }] },
  )
const stored = (store: typeof emptyStore) => Option.getOrThrow(entry(store, key))

describe.each(names)('a field named %s', name => {
  it('is read and written with the window it was fetched with', () => {
    const store = read(emptyStore, name, page([], false, false), { first: 5 })

    expect(ownOf(stored(store).values, name)).toEqual(page([], false, false))
    expect({ ...stored(store).windows }).toEqual(one(name, windowKey({ first: 5 })))
  })

  it('records no window when read without one', () => {
    expect({ ...stored(read(emptyStore, name, 'x')).windows }).toEqual({})
  })

  it('is not missing when held with no window and asked for with one or none', () => {
    const store = read(emptyStore, name, 'x')

    expect(missingFields(store, key, [name], {})).toEqual([])
    expect(missingFields(store, key, [name], one(name, windowKey({ first: 5 })))).toEqual([])
  })

  it('is missing only when asked for with a window other than the one held', () => {
    const store = read(emptyStore, name, page([], false, false), { first: 5 })

    expect(missingFields(store, key, [name], {})).toEqual([])

    expect(missingFields(store, key, [name], one(name, windowKey({ first: 9 })))).toEqual([name])
  })
})

const User = Entity.make('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Model = Schema.Struct({ remote: Remote.Model })
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const held = (writes: Parameters<typeof writeEntities>[1]) => ({
  remote: { ...Remote.initial, entities: writeEntities(emptyStore, writes) },
})

describe.each(names)('a read of a field named %s', name => {
  it('shows it as a scalar beside a relation', () => {
    const Odd = Entity.make(
      'Odd',
      Schema.Struct({ id: Schema.String, owner: Entity.ref(User), ...one(name, Schema.String) }),
    )
    const Data = Remote.make({ model: App.model.remote, entities: [User, Odd] })
    const read = Data.get(
      Odd.select({ ...one(name, true), owner: User.select({ name: true }) }),
      'o1',
    )
    const model = held([
      { key: 'Odd:o1', values: { owner: 'User:u1', ...one(name, 'odd') } },
      { key: 'User:u1', values: { name: 'Ada' } },
    ])
    const shown = read.read(model)

    expect(shown).toMatchObject({ _tag: 'Ready', value: one(name, 'odd') })

    const captured = captureRemote(model.remote, [read]).entities['Odd:o1']
    expect(captured?.values).toEqual({ owner: 'User:u1', ...one(name, 'odd') })
    expect(captured?.windows).toEqual({})
  })

  it('shows it as a relation', () => {
    const Odd = Entity.make(
      'Odd',
      Schema.Struct({ id: Schema.String, ...one(name, Entity.ref(User)) }),
    )
    const Data = Remote.make({ model: App.model.remote, entities: [User, Odd] })
    const read = Data.get(Odd.select(one(name, User.select({ name: true }))), 'o1')
    const shown = read.read(
      held([
        { key: 'Odd:o1', values: one(name, 'User:u1') },
        { key: 'User:u1', values: { name: 'Ada' } },
      ]),
    )

    expect(shown).toMatchObject({ _tag: 'Ready', value: one(name, { name: 'Ada' }) })
  })
})

describe.each(names)('a page relation named %s', name => {
  it('is selected with its window and the fields of its targets', () => {
    const Odd = Entity.make(
      'Odd',
      Schema.Struct({ id: Schema.String, ...one(name, Entity.refPage(User)) }),
    )
    const selection = Selection.make(
      Odd,
      one(name, Selection.connection(User, { first: 5 }, Selection.make(User, { name: true }))),
    )

    expect({ ...selection.connections }).toEqual(one(name, { first: 5 }))
    expect(Object.keys(selection.relations ?? {})).toEqual([name])
    expect(
      Schema.decodeUnknownSync(selection.schema)(
        one(name, { items: [], hasNext: false, hasPrevious: false }),
      ),
    ).toEqual(one(name, { items: [], hasNext: false, hasPrevious: false }))
  })
})

describe.each(names)('a page relation named %s, held', name => {
  it('is captured with the window it was read with', () => {
    const Odd = Entity.make(
      'Odd',
      Schema.Struct({ id: Schema.String, ...one(name, Entity.refPage(User)) }),
    )
    const Data = Remote.make({ model: App.model.remote, entities: [User, Odd] })
    const asked = Data.get(
      Odd.select(
        one(name, Selection.connection(User, { first: 5 }, Selection.make(User, { name: true }))),
      ),
      'o1',
    )
    const entities = Remote.writeRead(
      emptyStore,
      [{ entity: 'Odd', id: 'o1', fields: [name], windows: one(name, { first: 5 }) }],
      {
        settled: [],
        entities: [{ entity: 'Odd', id: 'o1', values: one(name, page([], false, false)) }],
      },
    )
    const captured = captureRemote({ ...Remote.initial, entities }, [asked]).entities['Odd:o1']

    expect(Object.entries(captured?.windows ?? {})).toEqual([[name, windowKey({ first: 5 })]])
  })
})

describe.each(names)('a relation named %s', name => {
  it('is kept when requirements merge', () => {
    const owner = { entity: 'User', fields: ['name'] }
    const [merged] = Requirement.merge([
      { entity: 'Odd', id: 'o1', fields: ['owner'], relations: { owner } },
      { entity: 'Odd', id: 'o1', fields: [name], relations: one(name, owner) },
    ])

    expect(merged?.relations).toEqual({ owner, ...one(name, owner) })
  })
})

// Each name written out, so the types see it: a bare `__proto__:` in a literal
// would set the prototype, so that one is computed.
const domainOdd = (name: (typeof names)[number]) => {
  switch (name) {
    case '__proto__': {
      const Odd = DomainEntity.define(
        'Odd',
        Schema.Struct({ id: Schema.String, ['__proto__']: Schema.String }),
      )
      return {
        Odd,
        read: Remote.make({ model: App.model.remote, entities: [Odd] }).get(
          DomainEntity.select(Odd, { ['__proto__']: true }),
          'o1',
        ),
      }
    }
    case 'constructor': {
      const Odd = DomainEntity.define(
        'Odd',
        Schema.Struct({ id: Schema.String, constructor: Schema.String }),
      )
      return {
        Odd,
        read: Remote.make({ model: App.model.remote, entities: [Odd] }).get(
          DomainEntity.select(Odd, { constructor: true }),
          'o1',
        ),
      }
    }
    case 'toString': {
      const Odd = DomainEntity.define(
        'Odd',
        Schema.Struct({ id: Schema.String, toString: Schema.String }),
      )
      return {
        Odd,
        read: Remote.make({ model: App.model.remote, entities: [Odd] }).get(
          DomainEntity.select(Odd, { toString: true }),
          'o1',
        ),
      }
    }
  }
}

describe.each(names)('a foldkit-entity field named %s', name => {
  it('is read through Remote', () => {
    const { Odd, read } = domainOdd(name)
    expect(Object.keys(Entity.from(Odd).fields)).toEqual(['id', name])

    expect(read.read(held([{ key: 'Odd:o1', values: one(name, 'odd') }]))).toMatchObject({
      _tag: 'Ready',
      value: one(name, 'odd'),
    })
  })
})
