/**
 * `Bundle.compose` builds the parent the hand-written way would: the same
 * Model and Message, children that route and lift as `Page.at` places them,
 * an assembly that initializes and updates, and a refusal for a name given
 * twice.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { Bundle, type Wiring } from '../src/index.js'

const HelloModel = Schema.Struct({ name: Schema.String })
const HelloMessage = defineMessageUnion({ ChangedName: { value: Schema.String }, Submitted: {} })
const Greeted = Schema.TaggedStruct('Greeted', { name: Schema.String })

const Hello = Bundle.make('Hello', {
  Model: HelloModel,
  Message: HelloMessage,
  init: () => ({ model: { name: '' } }),
  update: (model, message) =>
    message._tag === 'Submitted'
      ? { model, outMessage: Greeted.make({ name: model.name }) }
      : { model: { name: message.value } },
})

const CountModel = Schema.Struct({ count: Schema.Number })
const CountMessage = defineMessageUnion({ Incremented: {} })
const Count = Bundle.make('Count', {
  Model: CountModel,
  Message: CountMessage,
  args: Schema.Struct({ start: Schema.Number }),
  init: ({ start }) => ({ model: { count: start } }),
  update: model => ({ model: { count: model.count + 1 } }),
})

const App = Bundle.compose({ greeting: Schema.String }).pipe(
  Bundle.withMessages({ ClickedReset: {} }),
  Bundle.withChild('hello', Hello, {
    onOut: out => model => ({ model: { ...model, greeting: `Hello, ${out.name}!` } }),
  }),
  Bundle.withChild('clicks', Count, { args: { start: 3 } }),
  Bundle.withEach('rows', Count, { args: { start: 0 } }),
)

const update = App.placements.update((model, message) =>
  message._tag === 'ClickedReset' ? { model: { ...model, greeting: '' } } : { model },
)

describe('Bundle.compose', () => {
  it('derives a Model that decodes the parent and its children', () => {
    const decoded = Schema.decodeUnknownSync(App.Model)({
      greeting: 'x',
      hello: { name: 'Ada' },
      clicks: { count: 1 },
      rows: { a: { count: 2 } },
    })
    expect(decoded.rows).toEqual({ a: { count: 2 } })
    expect(() => Schema.decodeUnknownSync(App.Model)({ greeting: 'x' })).toThrow()
  })

  it('starts each child from its own init, and the parent from what it gives', () => {
    const initial = App.placements.initial({ greeting: 'Hi' })
    expect(initial.model).toEqual({
      greeting: 'Hi',
      hello: { name: '' },
      clicks: { count: 3 },
      rows: {},
    })
  })

  it("routes a child's Message to it, and its OutMessage through onOut", () => {
    const start = App.placements.initial({ greeting: '' }).model
    const typed = update(
      start,
      App.Message.GotHelloMessage({ message: HelloMessage.ChangedName({ value: 'Ada' }) }),
    ).model
    expect(typed.hello).toEqual({ name: 'Ada' })

    const submitted = update(
      typed,
      App.Message.GotHelloMessage({ message: HelloMessage.Submitted() }),
    )
    expect(submitted.model.greeting).toBe('Hello, Ada!')

    const clicked = update(
      submitted.model,
      App.Message.GotClicksMessage({ message: CountMessage.Incremented() }),
    )
    expect(clicked.model.clicks).toEqual({ count: 4 })
  })

  it('routes a keyed child to its row', () => {
    const start = { ...App.placements.initial({ greeting: '' }).model, rows: { a: { count: 0 } } }
    const next = update(
      start,
      App.Message.GotRowsMessage({ key: 'a', message: CountMessage.Incremented() }),
    )
    expect(next.model.rows).toEqual({ a: { count: 1 } })
  })

  it("sends the parent's own Messages to its own update", () => {
    const start = { ...App.placements.initial({ greeting: 'x' }).model }
    expect(update(start, App.Message.ClickedReset()).model.greeting).toBe('')
    expect(Option.isNone(App.placements.route(start, App.Message.ClickedReset()))).toBe(true)
  })

  it("joins a wiring, whose Messages route to it and whose init runs after the children's", () => {
    const Base = Bundle.compose({ greeting: Schema.String }).pipe(
      Bundle.withMessages({ Pinged: {} }),
    )
    const ping: Wiring<typeof Base.Model.Type, typeof Base.Message.Type> = {
      key: 'test:ping',
      handles: ['Pinged'],
      route: (model, message) =>
        message._tag === 'Pinged'
          ? Option.some({ model: { ...model, greeting: 'pong' } })
          : Option.none(),
      init: model => ({ model: { ...model, greeting: `${model.greeting}!` } }),
    }
    const Wired = Base.pipe(Bundle.withWiring(ping))
    expect(Wired.placements.initial({ greeting: 'hi' }).model.greeting).toBe('hi!')
    const next = Wired.placements.update()({ greeting: '' }, Wired.Message.Pinged())
    expect(next.model.greeting).toBe('pong')
  })

  it('refuses a field or a Message case given twice', () => {
    expect(() =>
      Bundle.compose({ clicks: Schema.Number }).pipe(
        // @ts-expect-error the parent has `clicks` already
        Bundle.withChild('clicks', Count, { args: { start: 0 } }),
      ),
    ).toThrow('the field "clicks" is declared twice')
    expect(() =>
      Bundle.compose({ greeting: Schema.String }).pipe(
        Bundle.withMessages({ GotClicksMessage: {} }),
        Bundle.withChild('clicks', Count, { args: { start: 0 } }),
      ),
    ).toThrow('the Message case "GotClicksMessage" is declared twice')
    expect(() =>
      Bundle.compose({}).pipe(
        Bundle.withMessages({ Reset: {} }),
        Bundle.withMessages({ Reset: {} }),
      ),
    ).toThrow('the Message case "Reset" is declared twice')
  })
})

describe('Bundle.configure', () => {
  it("places a child with the config given after its field, and runs that config's onOut", () => {
    const Base = Bundle.compose({ greeting: Schema.String }).pipe(
      Bundle.withChild('hello', Hello),
      Bundle.withChild('clicks', Count),
    )
    const Page = Base.pipe(
      Bundle.configure('hello', {
        onOut: out => model => ({ model: { ...model, greeting: `Configured, ${out.name}` } }),
      }),
      Bundle.configure('clicks', { args: { start: 7 } }),
    )
    const start = Page.placements.initial({ greeting: '' }).model
    expect(start.clicks).toEqual({ count: 7 })
    const update = Page.placements.update()
    const typed = update(
      start,
      Page.Message.GotHelloMessage({ message: HelloMessage.ChangedName({ value: 'Ada' }) }),
    ).model
    const submitted = update(
      typed,
      Page.Message.GotHelloMessage({ message: HelloMessage.Submitted() }),
    )
    expect(submitted.model.greeting).toBe('Configured, Ada')
  })

  it('places once: a child read from children is the one the assembly routes to', () => {
    const Page = Bundle.compose({}).pipe(Bundle.withChild('clicks', Count, { args: { start: 0 } }))
    expect(Page.children.clicks).toBe(Page.children.clicks)
    expect(Page.placements).toBe(Page.placements)
    expect(Page.placements.placements).toContain(Page.children.clicks)
  })

  it('refuses a child it does not have, or one configured already', () => {
    const Base = Bundle.compose({}).pipe(Bundle.withChild('clicks', Count, { args: { start: 0 } }))
    // @ts-expect-error there is no child `missing`
    expect(() => Base.pipe(Bundle.configure('missing', {}))).toThrow(
      'the parent has no child "missing"',
    )
    expect(() =>
      // @ts-expect-error `clicks` has its config already
      Base.pipe(Bundle.configure('clicks', { args: { start: 1 } })),
    ).toThrow('the child "clicks" was given its config already')
  })
})

describe('Bundle.compose against the hand-written parent', () => {
  it('gives the same Model and Message tags', () => {
    const Clicks = Bundle.declare(Count, 'clicks')
    const Model = Schema.Struct({ greeting: Schema.String, ...Clicks.fields })
    const Message = defineMessageUnion({ ClickedReset: {}, ...Clicks.cases })
    const Composed = Bundle.compose({ greeting: Schema.String }).pipe(
      Bundle.withMessages({ ClickedReset: {} }),
      Bundle.withChild('clicks', Count, { args: { start: 0 } }),
    )
    expect(Object.keys(Composed.Model.fields)).toEqual(Object.keys(Model.fields))
    // Each union reads what the other makes, and nothing else.
    const handWritten = [
      Message.ClickedReset(),
      Message.GotClicksMessage({ message: CountMessage.Incremented() }),
    ]
    const composed = [
      Composed.Message.ClickedReset(),
      Composed.Message.GotClicksMessage({ message: CountMessage.Incremented() }),
    ]
    for (const message of handWritten) {
      expect(Schema.decodeUnknownSync(Composed.Message)(message)).toEqual(message)
    }
    for (const message of composed) {
      expect(Schema.decodeUnknownSync(Message)(message)).toEqual(message)
    }
    expect(() => Schema.decodeUnknownSync(Composed.Message)({ _tag: 'Other' })).toThrow()
  })
})
