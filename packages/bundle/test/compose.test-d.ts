/**
 * `Bundle.compose` derives the parent's types: each step is typed by the parent
 * built so far, and the result's Model, Message, children and assembly are the
 * ones the hand-written `declare` / `parent` / `at` / `assemble` would give.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Update from 'foldkit/update'
import { describe, expectTypeOf, it } from 'vitest'
import { Bundle } from '../src/index.js'

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
    onOut: out => model => {
      // The parent as it is at this step: its own field and this child's.
      expectTypeOf(model.greeting).toEqualTypeOf<string>()
      expectTypeOf(model.hello).toEqualTypeOf<{ readonly name: string }>()
      return { model: { ...model, greeting: `Hello, ${out.name}!` } }
    },
  }),
  Bundle.withChild('clicks', Count, { args: { start: 0 } }),
)

describe('Bundle.compose', () => {
  it('derives the Model and the Message', () => {
    expectTypeOf<typeof App.Model.Type>().toEqualTypeOf<{
      readonly greeting: string
      readonly hello: { readonly name: string }
      readonly clicks: { readonly count: number }
    }>()
    expectTypeOf<(typeof App.Message.Type)['_tag']>().toEqualTypeOf<
      'ClickedReset' | 'GotHelloMessage' | 'GotClicksMessage'
    >()
    expectTypeOf(App.Message.GotHelloMessage({ message: HelloMessage.Submitted() })).toExtend<
      typeof App.Message.Type
    >()
  })

  it('places each child under its field', () => {
    expectTypeOf(App.children.hello.name).toEqualTypeOf<'Hello'>()
    expectTypeOf(App.children.clicks.name).toEqualTypeOf<'Count'>()
    // A helper is an Update Step on the whole parent.
    expectTypeOf(App.children.hello.init).parameter(0).toEqualTypeOf<typeof App.Model.Type>()
  })

  it('asks initial for exactly the fields no child owns', () => {
    App.placements.initial({ greeting: '' })
    // @ts-expect-error `greeting` is the parent's own and has no init
    App.placements.initial({})
    // @ts-expect-error `hello` is a child's, which its own init writes
    App.placements.initial({ greeting: '', hello: { name: '' } })
  })

  it("routes the parent's own Messages to its own update", () => {
    const update = App.placements.update((model, message) =>
      message._tag === 'ClickedReset' ? { model: { ...model, greeting: '' } } : { model },
    )
    expectTypeOf(update).returns.toExtend<
      Update.Return<typeof App.Model.Type, typeof App.Message.Type, never>
    >()
  })
})

describe('mistakes are reported at the step', () => {
  it('rejects an onOut that writes the wrong type', () => {
    Bundle.compose({ greeting: Schema.String }).pipe(
      Bundle.withChild('hello', Hello, {
        // @ts-expect-error `greeting` is a string
        onOut: () => model => ({ model: { ...model, greeting: 1 } }),
      }),
    )
  })

  it('requires onOut for a bundle with an OutMessage, and args for one with args', () => {
    // @ts-expect-error Hello has an OutMessage, so onOut is required
    Bundle.compose({}).pipe(Bundle.withChild('hello', Hello))
    // @ts-expect-error Count takes args
    Bundle.compose({}).pipe(Bundle.withChild('clicks', Count))
  })

  it('rejects a field the parent already has', () => {
    Bundle.compose({ clicks: Schema.Number }).pipe(
      // @ts-expect-error the parent has `clicks` already
      Bundle.withChild('clicks', Count, { args: { start: 0 } }),
    )
  })
})
