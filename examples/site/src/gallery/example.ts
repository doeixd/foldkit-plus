/**
 * How one example of a component's page is declared: a module of its own
 * under `src/examples/<slug>/<name>.ts`, shown whole beside what it draws.
 * `example(...)` is the site's harness and the one thing a reader leaves
 * behind: `recipe` goes to `forSlots`, `state` to `Bundle.withChild` (or is
 * the application's own composition already), and `view`'s body is the call.
 */
import { Option, type Schema } from 'effect'
import type { Command } from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { Subscriptions } from 'foldkit/subscription'
import type { NamedStyle, StylePieces } from 'foldkit-mixins'

/** A recipe as the page reads it: its axes, and the pieces of a selection. */
export interface RecipeOf<Slots> {
  (selection: never): StylePieces<Slots>
  readonly def: {
    readonly variants: Readonly<Record<string, object>>
    readonly defaults?: Readonly<Record<string, string | undefined>>
  }
}

interface Step<Model, Message> {
  readonly model: Model
  readonly commands?: ReadonlyArray<Command<Message>> | undefined
}

/**
 * What an example runs on. A shipped Bundle with its args bound
 * (`Bundles.TagsInput.with({ id: 'labels' })`) fits, and so does what
 * `App.placements.runtime({ Model: App.Model, initial })` returns for a
 * composition the example declares, which is how it holds a value of its own.
 * A Bundle's OutMessage is dropped here, as `Bundle.ignore` drops it.
 */
export interface ExampleState<Model, Message> {
  // The Schemas alone declare the types: `init` and `update` are checked
  // against them, so a literal written in `init` is not widened first.
  readonly Model: Schema.Codec<Model, unknown>
  /** Needed where `update` is written inline, whose parameter would otherwise name no type. */
  readonly Message?: Schema.Codec<Message, unknown>
  readonly init: (args: void) => Step<NoInfer<Model>, NoInfer<Message>>
  readonly update: (
    model: NoInfer<Model>,
    message: Message,
    args: void,
  ) => Step<NoInfer<Model>, NoInfer<Message>>
  readonly subscriptions?:
    | Subscriptions<NoInfer<Model>, NoInfer<Message>>
    | ((args: void) => Subscriptions<NoInfer<Model>, NoInfer<Message>>)
    | undefined
}

/** What an example's `view` is handed. */
export interface ExampleContext<Slots, Model, Message, Outer> {
  /** The recipe's selection the reader picked on the page, compiled for `slots`. */
  readonly style: NamedStyle<Slots>
  /** The example's state, where it declared one. */
  readonly model: Model
  /** Lifts the state's Messages into the page's. */
  readonly onMessage: (message: Message) => Outer
  readonly h: HtmlBuilder<Outer>
}

export interface ExampleSpec<Slots, Model, Message> {
  readonly title: string
  readonly slots: Slots
  readonly recipe: RecipeOf<Slots>
  /** Axis values this example holds whatever the reader picks. */
  readonly pins?: Readonly<Record<string, string>>
  readonly state?: ExampleState<Model, Message>
  readonly view: <Outer>(context: ExampleContext<Slots, Model, Message, Outer>) => Html
}

/** An example's state with its types forgotten, as the gallery's one Model holds every example's. */
export interface RunningState {
  readonly Model: Schema.Codec<unknown, unknown>
  readonly initial: unknown
  readonly update: (model: unknown, message: unknown) => Step<unknown, unknown>
  readonly subscriptions: Subscriptions<unknown, unknown>
}

/** An example as a page holds it. */
export interface Example<Slots> {
  readonly title: string
  readonly slots: Slots
  readonly recipe: RecipeOf<Slots>
  readonly pins: Readonly<Record<string, string>>
  readonly state: Option.Option<RunningState>
  readonly render: <Outer>(
    style: NamedStyle<Slots>,
    model: unknown,
    onMessage: (message: unknown) => Outer,
    h: HtmlBuilder<Outer>,
  ) => Html
}

/**
 * Declares an example. With no `state`, `view` reads no `model` and sends
 * nothing.
 */
export const example = <Slots, const Model = undefined, Message = never>(
  spec: ExampleSpec<Slots, Model, Message>,
): Example<Slots> => ({
  title: spec.title,
  slots: spec.slots,
  recipe: spec.recipe,
  pins: spec.pins ?? {},
  state: Option.map(Option.fromUndefinedOr(spec.state), running),
  // The seam, with `running` below: the gallery keeps every example's state in
  // one Model, built from whichever modules the pages list, so it holds each
  // as `unknown`. The value handed back here is the one this example's own
  // `init` and `update` made, under this example's key (`examplesState.ts`).
  render: (style, model, onMessage, h) => spec.view({ style, model: model as Model, onMessage, h }),
})

const running = <Model, Message>(state: ExampleState<Model, Message>): RunningState => {
  const start = state.init()
  // The server draws the page from this Model and the browser starts from
  // the same one: a Command at the start would run in one and not the other.
  if ((start.commands ?? []).length > 0)
    throw new Error('an example’s state starts with a Command, which a served page cannot run')
  const { subscriptions = {} } = state
  return {
    Model: state.Model,
    initial: start.model,
    update: (model, message) => state.update(model as Model, message as Message),
    subscriptions: (typeof subscriptions === 'function'
      ? subscriptions()
      : subscriptions) as Subscriptions<unknown, unknown>,
  }
}
