/**
 * Typeahead over a set of items: printable keys build a query that a timer
 * clears, and the query picks the item to move to. The query lives in the
 * Model so a replay sees the same picks; the timer runs on Effect's clock so
 * TestClock drives it. Which item matches is a pure function.
 */
import { Effect, Option, Schema } from 'effect'
import type { KeyboardModifiers } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Bundle, type Declared } from 'foldkit-bundle'
import { Behavior, Behaviors, Capability, SlotView } from 'foldkit-mixins'
import { clearQuery } from '../internal.js'

export const Model = Schema.Struct({
  query: Schema.String,
  /** Bumped per keystroke, carried by the clear it schedules, so a superseded
   *  timer's `Expired` changes nothing. */
  generation: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** A printable key was pressed with no ctrl, alt or meta. */
  Typed: { char: Schema.String },
  /** The clear timer fired for `generation`. */
  Expired: { generation: Schema.Number },
  /** The query was dropped on purpose (a blur, a selection). */
  Cleared: {},
})
export type Message = typeof Message.Type

export const Args = Schema.Struct({
  /** How long the query survives after the last key. */
  timeoutMs: Schema.Number.pipe(
    Schema.check(Schema.isGreaterThan(0)),
    Schema.check(Schema.isFinite()),
  ),
})
export type Args = typeof Args.Type

const update = (model: Model, message: Message, args: Args): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    Typed: ({ char }) => {
      const generation = model.generation + 1
      return {
        model: { query: model.query + char, generation },
        commands: [
          {
            name: 'Typeahead.expire',
            args: { generation },
            effect: Effect.as(Effect.sleep(args.timeoutMs), Message.Expired({ generation })),
          },
        ],
      }
    },
    Expired: ({ generation }) => (generation === model.generation ? clearQuery(model) : { model }),
    Cleared: () => clearQuery(model),
  })

export const bundle = Bundle.make('Typeahead', {
  Model,
  Message,
  args: Args,
  init: () => ({ model: { query: '', generation: 0 } }),
  update,
  /** What a parent decides: `placed.helpers.clear()` drops the query, after a blur or a choice. */
  helpers: args => ({
    clear: (model: Model) => update(model, Message.Cleared(), args),
  }),
})

const normalize = (text: string): string => text.trimStart().toLocaleLowerCase()

const isRepeated = (query: string): boolean =>
  query.length > 1 && [...query].every(char => char === query[0])

/**
 * The enabled index whose text starts with `query`, searching forward from
 * `current` and wrapping, or `undefined`. A query of one character, or one
 * character repeated (`aaa`), starts *after* the current item so repeated
 * presses cycle through the items that begin with it; a longer query starts
 * *at* the current item, since the user is refining a match. Case and leading
 * whitespace are ignored.
 */
export const match = (
  texts: ReadonlyArray<string>,
  enabled: ReadonlyArray<number>,
  query: string,
  current: number,
): number | undefined => {
  if (query === '' || enabled.length === 0) return undefined
  const needle = normalize(isRepeated(query) ? query[0]! : query)
  const position = enabled.indexOf(current)
  const startAfter = needle.length === 1 || isRepeated(query)
  const start = position === -1 ? 0 : startAfter ? position + 1 : position
  for (let offset = 0; offset < enabled.length; offset += 1) {
    const index = enabled[(start + offset) % enabled.length]!
    if (normalize(texts[index] ?? '').startsWith(needle)) return index
  }
  return undefined
}

/** One character (a code point, not a UTF-16 unit) with no ctrl, alt or meta: a typeahead key. */
export const isPrintable = (key: string, modifiers: KeyboardModifiers): boolean =>
  Behaviors.Keys.matches(Behaviors.Keys.printable, key, modifiers)

export interface KeyOptions<Input> {
  readonly items: (input: Input) => Behaviors.Collection.Items<unknown>
  /** The text an item is matched by. */
  readonly text: (input: Input, index: number) => string
  /** The current item's id, so the search starts from it; a placed
   *  `RovingTabindex` is the usual source. */
  readonly current: (input: Input) => string | null
}

export interface BehaviorOptions<Input, Slots> extends KeyOptions<Input> {
  /** The slot that receives the keys. */
  readonly host: keyof Slots & string
}

/**
 * The route a `Typeahead` installs on its host: every printable key extends
 * the query, focuses the matching item by its id (which then reports itself
 * current, through `RovingTabindex`'s `OnFocus`), and answers `Typed`. With no
 * match the key still extends the query, so the next one can match; a space
 * with an empty query is left to the host (it activates).
 */
export const keys =
  <Field extends string>(declared: Declared<typeof bundle, Field>) =>
  <Input extends { readonly [K in Field]: Model }, ParentMessage>(
    options: KeyOptions<Input>,
  ): Behaviors.Keys.Route<Input, ParentMessage> =>
    Behaviors.Keys.route<Input, ParentMessage>('Typeahead', {
      on: [Behaviors.Keys.printable],
      handle: ({ key, input }) => {
        const query = input[declared.field].query
        if (key === ' ' && query === '') return Option.none()
        const items = options.items(input)
        const currentId = options.current(input)
        const current = currentId === null ? -1 : items.indexOf(currentId)
        // Read on a key, not on every render.
        const texts = items.ids.map((_, index) => options.text(input, index))
        const found = match(texts, items.enabled, query + key, current)
        const target = found === undefined ? currentId : items.ids[found]
        const typed = declared.wrapper.make(
          Message.Typed({ char: key }),
        ) as unknown as ParentMessage
        // No match and nothing current moves no focus, but the key is still recorded.
        return Option.some(
          target === null || target === undefined ? typed : Behaviors.Keys.focus(target, typed),
        )
      },
    })

/**
 * Wires a placed `Typeahead` to the host slot with the `keys` route.
 */
export const behavior = <Field extends string>(declared: Declared<typeof bundle, Field>) => {
  function place<Slots, Input extends { readonly [K in Field]: Model }, ParentMessage>(
    bound: SlotView.Bound<Slots, Input, ParentMessage>,
  ): (options: BehaviorOptions<Input, Slots>) => Behavior.NamedBehavior<Slots, Input, ParentMessage>
  function place<Slots>(
    slots: SlotView.Unbound<Slots>,
  ): <Input extends { readonly [K in Field]: Model }, ParentMessage>(
    options: BehaviorOptions<Input, Slots>,
  ) => Behavior.NamedBehavior<Slots, Input, ParentMessage>
  function place<Slots>(given: Slots | SlotView.Bound<Slots, any, any>) {
    const slots = SlotView.boundSlots(given)
    return <Input extends { readonly [K in Field]: Model }, ParentMessage>(
      options: BehaviorOptions<Input, Slots>,
    ): Behavior.NamedBehavior<Slots, Input, ParentMessage> => {
      const keydown = Behaviors.Keys.attribute<Input, ParentMessage>(
        [keys<Field>(declared)<Input, ParentMessage>(options)],
        { slot: options.host },
      )
      return Behavior.forSlots(slots)<Input, ParentMessage>(
        {
          [options.host]: Behavior.slot({
            requires: { capability: Capability.Interactive },
            attributes: context => [keydown(context)],
          }),
          // Keyed by a value the caller chose; `forSlots` checks the key exists.
        } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
        { name: 'Typeahead' },
      )
    }
  }
  return place
}
