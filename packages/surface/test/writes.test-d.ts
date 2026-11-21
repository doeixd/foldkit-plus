/**
 * `Writes` and `WritesCheck` at the type level: tags and Models come from the
 * application, and a transition must be named by one of its Messages.
 */
import { Option, Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Transition } from 'metakit'
import * as Machine from 'metakit/machine'
import { Surface, type DeclaredWrites, type DependencyTree } from '../src/index.js'
import { Writes, WritesCheck, type RegionFacts, type WriteDiagnostic } from '../src/writes.js'
import { App, Declared, Header, Message, Model, transitions, update } from './writesFixture.js'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
declare const expectTrue: <T extends true>() => T

const writes = Writes.of(App, Declared)

// The tags are the Machine's transitions, and the Message the application's.
expectTrue<
  Equal<
    typeof writes,
    Writes<Model, Message, 'Renamed' | 'Counted' | 'Deposited' | 'Moved' | 'Pinged' | 'Sneaked'>
  >
>()
expectTrue<
  Equal<
    ReturnType<typeof writes.regions>,
    ReadonlyArray<RegionFacts<'Renamed' | 'Counted' | 'Deposited' | 'Moved' | 'Pinged' | 'Sneaked'>>
  >
>()
expectTrue<Equal<ReturnType<typeof writes.declared>, Option.Option<DependencyTree>>>()

// `declared` takes a Message of the application, not a tag or another application's Message.
writes.declared(Message.Counted())
// @ts-expect-error a tag is not a Message
writes.declared('Counted')
// @ts-expect-error not a Message of this application
writes.declared({ _tag: 'Elsewhere' })

// It is what `Surface.rootView` takes, and the view keeps its type.
const _declared: DeclaredWrites<Model> = writes
const header = Surface.rootView(Header, undefined, (model, h) => h.h1([], [model.title]), {
  writes,
})
const _view: (model: Model, h: HtmlBuilder<Message>) => Html = header

// Writes of another application's Model are refused.
const Other = Schema.Struct({ other: Schema.String })
const OtherMessage = defineMessageUnion({ Renamed: { title: Schema.String } })
const OtherApp = Surface.application({ Model: Other, Message: OtherMessage })
const otherWrites = Writes.of(
  OtherApp,
  Machine.make({
    state: Other,
    transitions: {
      Renamed: Transition.make({
        state: Other,
        input: OtherMessage.Renamed,
        apply: ({ state, input }) => [Transition.set(state.other, input.title)],
      }),
    },
  }),
)
// @ts-expect-error these writes are of another Model
Surface.rootView(Header, undefined, (model, h) => h.h1([], [model.title]), { writes: otherWrites })

// A transition must be named by a Message of the application.
Writes.of(
  App,
  // @ts-expect-error `Archived` is not a Message tag of App
  Machine.make({ state: Model, transitions: { Archived: transitions.Pinged } }),
)
// A Machine over part of the Messages is taken: the rest have no declared writes.
Writes.of(App, Machine.make({ state: Model, transitions: { Counted: transitions.Counted } }))

// A write's target is a path of the Model's Schema, and its value of the field's type.
Transition.make({
  state: Model,
  input: Message.Renamed,
  // @ts-expect-error `subtitle` is not a field of the Model
  apply: ({ state, input }) => [Transition.set(state.subtitle, input.title)],
})
Transition.make({
  state: Model,
  input: Message.Renamed,
  // @ts-expect-error `count` holds a number
  apply: ({ state, input }) => [Transition.set(state.count, input.title)],
})

// `track` keeps the update's own return type.
const tracked = writes.track((model: Model, message: Message) => ({
  ...update(model, message),
  commands: ['kept'] as const,
}))
expectTrue<Equal<ReturnType<typeof tracked>['commands'], readonly ['kept']>>()
// @ts-expect-error the update is of another Model
writes.track((model: { readonly other: string }, _message: Message) => ({ model }))

// `verify` keeps the update's type, and takes the application's Surfaces.
const checked = WritesCheck.verify(writes, update, { surfaces: [Header] })
expectTrue<Equal<typeof checked, (model: Model, message: Message) => { readonly model: Model }>>()
WritesCheck.verify(writes, update, {
  report: (finding: WriteDiagnostic) => {
    expectTrue<Equal<(typeof finding)['_tag'], 'UndeclaredWrite' | 'OutsideWrite'>>()
  },
})
const OtherSurface = OtherApp.surface('Other', { model: ({ model }) => ({ other: model.other }) })
// @ts-expect-error a Surface of another application reads another Model
WritesCheck.verify(writes, update, { surfaces: [OtherSurface] })
