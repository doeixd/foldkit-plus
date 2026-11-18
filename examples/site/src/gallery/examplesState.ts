/**
 * The state of every example that is a module of its own, as one field of the
 * gallery's Model: each under its key, started and folded by the example's
 * own state. Which examples there are is read from the pages when this module
 * loads, so the field's type is the keys' only: each value is `unknown` here
 * and typed again where its example draws it (`example.ts`).
 */
import { Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { modifyFields } from 'foldkit/struct'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'

import type { RunningState } from './example.js'
import { listed, PRIMITIVES_SLUG } from './primitiveExamples.js'
import { showcases } from './showcases.js'

export interface Running {
  /** The page it is on. */
  readonly slug: string
  readonly key: string
  readonly state: RunningState
}

export type Model = Readonly<Record<string, unknown>>

/** An example's Message, under its key. */
export const fields = { key: Schema.String, message: Schema.Unknown }
export interface Message {
  readonly key: string
  readonly message: unknown
}

/** One Model, fold and set of Subscriptions over `running`. */
export const over = (running: ReadonlyArray<Running>) => {
  const byKey = new Map(running.map(each => [each.key, each.state]))
  if (byKey.size !== running.length) throw new Error('two examples share a key')
  return {
    Model: Schema.Struct(Object.fromEntries(running.map(({ key, state }) => [key, state.Model]))),
    initial: Object.fromEntries(running.map(({ key, state }) => [key, state.initial])),
    /** `model` after the example at `key` folded `message`; the same Model for a key of none, or a no-op. */
    update: <Outer>(
      model: Model,
      { key, message }: Message,
      toParent: (message: Message) => Outer,
    ): Update.Return<Model, Outer> =>
      Option.match(Option.fromNullishOr(byKey.get(key)), {
        onNone: () => ({ model }),
        onSome: state => {
          const step = state.update(model[key], message)
          return {
            model:
              step.model === model[key] ? model : modifyFields(model, { [key]: () => step.model }),
            commands: Command.mapMessages(step.commands ?? [], inner =>
              toParent({ key, message: inner }),
            ),
          }
        },
      }),
    /**
     * Every example's Subscriptions over the page's Model, each entry under
     * its example's key and running only on its example's page.
     */
    subscriptions: <Parent, Outer>(config: {
      readonly read: (parent: Parent) => Model
      readonly onPage: (parent: Parent, slug: string) => boolean
      readonly toParent: (message: Message) => Outer
    }): Subscription.Subscriptions<Parent, Outer> =>
      Object.fromEntries(
        running.flatMap(({ slug, key, state }) =>
          Object.entries(
            Subscription.lift(state.subscriptions)<Parent, Outer>({
              read: parent => Option.some(config.read(parent)[key]),
              toParentMessage: message => config.toParent({ key, message }),
              when: parent => config.onPage(parent, slug),
            }),
          ).map(([name, entry]) => [`${key}:${name}`, entry]),
        ),
      ),
  }
}

export const { Model, initial, update, subscriptions } = over([
  ...showcases.flatMap(showcase =>
    showcase.states.map(({ key, state }) => ({ slug: showcase.slug, key, state })),
  ),
  // The Primitives gallery's examples run on its one page.
  ...listed.map(({ key, example }) => ({ slug: PRIMITIVES_SLUG, key, state: example.state })),
])
