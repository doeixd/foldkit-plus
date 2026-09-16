/**
 * One bundle placed per key: routing, add and remove, late Messages, helpers,
 * the merged Subscription entry, and per-item views.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Submodel from 'foldkit/submodel'
import * as Subscription from 'foldkit/subscription'
import { Scene } from 'foldkit/test'
import type * as Update from 'foldkit/update'
import { describe, expect, it } from 'vitest'
import { Bundle, Link } from '../src/index.js'

const ItemModel = Schema.Struct({ count: Schema.Number, live: Schema.Boolean })
type ItemModel = typeof ItemModel.Type
const ItemMessage = defineMessageUnion({ Clicked: {}, Toggled: {}, Ticked: {} })
type ItemMessage = typeof ItemMessage.Type
const Done = Schema.TaggedStruct('Done', { count: Schema.Number })
type Done = typeof Done.Type

const Item = Bundle.make({
  name: 'Item',
  Model: ItemModel,
  Message: ItemMessage,
  init: ({ start }: { readonly start: number; readonly goal: number }) => ({
    model: { count: start, live: false },
    commands: [{ name: 'Hello', effect: Effect.succeed(ItemMessage.Toggled()) }],
  }),
  update: (model, message, { goal }) => {
    switch (message._tag) {
      case 'Clicked':
      case 'Ticked': {
        const count = model.count + 1
        return count === goal
          ? { model: { ...model, count }, outMessage: Done.make({ count }) }
          : { model: { ...model, count } }
      }
      case 'Toggled':
        return { model: { ...model, live: !model.live } }
    }
  },
  subscriptions: () =>
    Subscription.make<ItemModel, ItemMessage>()(entry => ({
      ticks: entry(
        { live: Schema.Boolean },
        {
          modelToDependencies: model => ({ live: model.live }),
          dependenciesToStream: ({ live }) =>
            live ? Stream.make(ItemMessage.Ticked()) : Stream.empty,
        },
      ),
    })),
  view: Submodel.defineView<ItemModel, ItemMessage>((model, h) =>
    h.button([h.Class('item'), h.OnClick(ItemMessage.Clicked())], [String(model.count)]),
  ),
  helpers: {
    set: (model: ItemModel, count: number) => ({ model: { ...model, count } }),
  },
})

const GotItemMessage = Link.keyedWrapper('GotItemMessage', ItemMessage)
const Model = Schema.Struct({
  items: Schema.Record(Schema.String, ItemModel),
  done: Schema.Array(Schema.String),
  paused: Schema.Array(Schema.String),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ Noop: {}, ...GotItemMessage.cases })
type Message = typeof Message.Type

const Items = Item.each(
  Link.collection<Model>()('items', GotItemMessage, {
    when: (model, key) => !model.paused.includes(key),
  }),
  {
    args: { start: 0, goal: 2 },
    onOut:
      (out: Done, key): Update.Step<Model, Message> =>
      model => ({ model: { ...model, done: [...model.done, `${key}:${out.count}`] } }),
  },
)

const empty: Model = { items: {}, done: [], paused: [] }
const withItems = (items: Model['items'], rest: Partial<Model> = {}): Model => ({
  ...empty,
  items,
  ...rest,
})
const commandMessages = (result: Update.Return<Model, Message>) =>
  Effect.runSync(Effect.all((result.commands ?? []).map(command => command.effect)))

describe('Link.keyedWrapper', () => {
  it('carries the key and decodes as part of the parent Message', () => {
    const wrapped = GotItemMessage.make('x', ItemMessage.Clicked())
    expect(Schema.decodeUnknownSync(Message)(wrapped)).toEqual(wrapped)
    expect(GotItemMessage.fromParentMessage(wrapped)).toEqual(
      Option.some(['x', ItemMessage.Clicked()]),
    )
    expect(GotItemMessage.fromParentMessage(Message.Noop())).toEqual(Option.none())
  })
})

describe('Bundle.each', () => {
  it('adds an item from init, lifting its Commands with the key', () => {
    const added = Items.add('a')(empty)
    expect(added.model.items).toEqual({ a: { count: 0, live: false } })
    expect(commandMessages(added)).toEqual([GotItemMessage.make('a', ItemMessage.Toggled())])
  })

  it('routes a Message to its item only and folds the OutMessage with its key', () => {
    const model = withItems({ a: { count: 1, live: false }, b: { count: 0, live: false } })
    const result = Option.getOrThrow(
      Items.update(model, GotItemMessage.make('a', ItemMessage.Clicked())),
    )
    expect(result.model.items).toEqual({
      a: { count: 2, live: false },
      b: { count: 0, live: false },
    })
    expect(result.model.done).toEqual(['a:2'])
    expect(Items.update(model, Message.Noop())).toEqual(Option.none())
  })

  it('ignores a Message for a removed item', () => {
    const model = Items.remove('a')(withItems({ a: { count: 0, live: false } })).model
    expect(model.items).toEqual({})
    const late = Option.getOrThrow(
      Items.update(model, GotItemMessage.make('a', ItemMessage.Clicked())),
    )
    expect(late.model).toBe(model)
  })

  it('runs helpers against one item', () => {
    const model = withItems({ a: { count: 0, live: false }, b: { count: 0, live: false } })
    expect(Items.helpers.set('b', 5)(model).model.items).toEqual({
      a: { count: 0, live: false },
      b: { count: 5, live: false },
    })
  })
})

describe('collection subscriptions', () => {
  const entry = Items.subscriptions['Item@items[]/ticks']!

  it('lists every open item’s dependencies by key', () => {
    const model = withItems(
      { a: { count: 0, live: true }, b: { count: 0, live: false }, c: { count: 0, live: true } },
      { paused: ['c'] },
    )
    expect(entry.modelToDependencies(model)).toEqual({
      items: [
        ['a', { live: true }],
        ['b', { live: false }],
      ],
    })
  })

  it('merges the items’ streams, each wrapped with its key', async () => {
    const dependencies = entry.modelToDependencies(
      withItems({
        a: { count: 0, live: true },
        b: { count: 0, live: false },
        c: { count: 0, live: true },
      }),
    )
    const messages = await Effect.runPromise(
      Stream.runCollect(entry.dependenciesToStream(dependencies, () => dependencies)),
    )
    expect(messages).toHaveLength(2)
    expect(messages).toEqual(
      expect.arrayContaining([
        GotItemMessage.make('a', ItemMessage.Ticked()),
        GotItemMessage.make('c', ItemMessage.Ticked()),
      ]),
    )
  })

  it('has dependencies equal across Models that change no item’s dependencies', () => {
    const equivalence = Schema.toEquivalence(entry.dependenciesSchema)
    const before = withItems({ a: { count: 0, live: true } })
    const after = withItems({ a: { count: 9, live: true } })
    expect(equivalence(entry.modelToDependencies(before), entry.modelToDependencies(after))).toBe(
      true,
    )
    const added = withItems({ a: { count: 0, live: true }, b: { count: 0, live: false } })
    expect(equivalence(entry.modelToDependencies(before), entry.modelToDependencies(added))).toBe(
      false,
    )
  })
})

describe('collection views', () => {
  const update = (model: Model, message: Message) =>
    Option.getOrElse(Items.update(model, message), () => ({ model }))

  it('renders every item in its own slot and routes clicks by key', () => {
    Scene.scene(
      {
        update,
        view: (model, h) =>
          h.ul(
            [],
            Items.viewAll(model, h).map(item => h.li([], [item])),
          ),
      },
      Scene.given(withItems({ a: { count: 0, live: false }, b: { count: 7, live: false } })),
      Scene.click(Scene.nth(Scene.all.selector('.item'), 1)),
      Scene.expect(Scene.nth(Scene.all.selector('.item'), 1)).toHaveText('8'),
      Scene.expect(Scene.nth(Scene.all.selector('.item'), 0)).toHaveText('0'),
    )
  })

  it('renders nothing for a missing key', () => {
    Scene.scene(
      { update, view: (model, h) => h.div([h.Id('one')], [Items.view(model, h, 'missing')]) },
      Scene.given(empty),
      Scene.expect(Scene.selector('#one .item')).toBeAbsent(),
    )
  })
})
