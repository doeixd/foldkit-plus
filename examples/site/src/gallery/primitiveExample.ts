/**
 * How one live example of a primitive is declared: a module of its own under
 * `src/examples/primitives/<family>/<name>.ts`, shown whole beside what it
 * draws. Like a component's example (`example.ts`) it brings the state it
 * runs on, which the gallery's Model holds under its key; it draws with the
 * page's own Slots, since a primitive draws nothing of its own.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { SlotBuilders } from 'foldkit-mixins'

import type { SiteStyle } from '../style.js'
import { running, type ExampleState, type RunningState } from './example.js'

/** The page's own Slots, which an example draws with: a primitive has no markup of its own. */
export type PageSlots<Outer> = SlotBuilders<typeof SiteStyle.slots, Outer>

/** What an example's `view` is handed. */
export interface PrimitiveContext<Model, Msg, Outer> {
  readonly model: Model
  /** Lifts the state's Messages into the page's. */
  readonly onMessage: (message: Msg) => Outer
  readonly slots: PageSlots<Outer>
  readonly h: HtmlBuilder<Outer>
}

export interface PrimitiveSpec<Model, Msg> {
  readonly title: string
  /** What it shows, in a sentence or two; `code` in backticks is drawn as code. */
  readonly text: string
  /** `stateless` for a primitive that keeps nothing (a function the view calls). */
  readonly state: ExampleState<Model, Msg>
  readonly view: <Outer>(context: PrimitiveContext<Model, Msg, Outer>) => Html
}

/** An example as the page holds it, its state's types forgotten as the gallery's one Model holds every example's. */
export interface PrimitiveExample {
  readonly title: string
  readonly text: string
  readonly state: RunningState
  readonly render: <Outer>(
    slots: PageSlots<Outer>,
    model: unknown,
    onMessage: (message: unknown) => Outer,
    h: HtmlBuilder<Outer>,
  ) => Html
}

/** The state of an example whose primitive keeps no fact. */
export const stateless: ExampleState<undefined, never> = {
  Model: Schema.Undefined,
  init: () => ({ model: undefined }),
  update: model => ({ model }),
}

export const primitiveExample = <const Model, Msg>(
  spec: PrimitiveSpec<Model, Msg>,
): PrimitiveExample => ({
  title: spec.title,
  text: spec.text,
  state: running(spec.state),
  // The seam `example.ts` has: the gallery's Model holds each state as `unknown`; the value
  // handed back is the one this example's own `init` and `update` made, under its key.
  render: (slots, model, onMessage, h) =>
    spec.view({ model: model as Model, onMessage: message => onMessage(message), slots, h }),
})
