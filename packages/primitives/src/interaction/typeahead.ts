/**
 * Typeahead over a set of items: printable keys build a query that a timer
 * clears, and the query picks the item to move to. The query lives in the
 * Model so a replay sees the same picks; the timer runs on Effect's clock so
 * TestClock drives it. Which item matches is a pure function.
 */
import { Effect, Option, Schema } from 'effect'
import type { HtmlBuilder, KeyboardModifiers } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Bundle, type Declared } from 'foldkit-bundle'
import { Behavior, Behaviors, Capability } from 'foldkit-mixins'
import { idSelector } from './roving-tabindex.js'

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

export const bundle = Bundle.make('Typeahead', {
  Model,
  Message,
  args: Args,
  init: () => ({ model: { query: '', generation: 0 } }),
  update: (model, message, args) =>
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
      Expired: ({ generation }) =>
        generation === model.generation ? { model: { ...model, query: '' } } : { model },
      Cleared: () => ({ model: { ...model, query: '' } }),
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

/** A single character with no ctrl, alt or meta: a typeahead key. */
export const isPrintable = (key: string, modifiers: KeyboardModifiers): boolean =>
  key.length === 1 && !modifiers.ctrlKey && !modifiers.altKey && !modifiers.metaKey

export interface BehaviorOptions<Input, Slots> {
  /** The slot that receives the keys. */
  readonly host: keyof Slots & string
  readonly items: (input: Input) => Behaviors.Collection.Items<unknown>
  /** The text an item is matched by. */
  readonly text: (input: Input, index: number) => string
  /** The current item's id, so the search starts from it; a placed
   *  `RovingTabindex` is the usual source. */
  readonly current: (input: Input) => string | null
}

/**
 * Wires a placed `Typeahead` to the host slot: a printable key extends the
 * query, focuses the matching item by its id (which then reports itself
 * current, through `RovingTabindex`'s `OnFocus`), and dispatches `Typed`.
 * With no match the key still extends the query, so the next one can match;
 * a space with an empty query is left to the host (it activates).
 */
export const behavior =
  <Field extends string>(declared: Declared<typeof bundle, Field>) =>
  <Slots>(slots: Slots) =>
  <Input extends { readonly [K in Field]: Model }, ParentMessage>(
    options: BehaviorOptions<Input, Slots>,
  ): Behavior.NamedBehavior<Slots, Input, ParentMessage> => {
    const wrap = (char: string): ParentMessage =>
      declared.wrapper.make(Message.Typed({ char })) as unknown as ParentMessage
    return Behavior.forSlots(slots)<Input, ParentMessage>(
      {
        [options.host]: Behavior.slot({
          requires: { capability: Capability.Interactive },
          attributes: ({
            input,
            h,
          }: {
            readonly input: Input
            readonly h: HtmlBuilder<ParentMessage>
          }) => {
            const items = options.items(input)
            const query = input[declared.field].query
            const currentId = options.current(input)
            const current = currentId === null ? -1 : items.indexOf(currentId)
            const texts = items.ids.map((_, index) => options.text(input, index))
            return [
              h.OnKeyDownFocus((key, modifiers) => {
                if (!isPrintable(key, modifiers)) return Option.none()
                if (key === ' ' && query === '') return Option.none()
                const found = match(texts, items.enabled, query + key, current)
                const target = found === undefined ? currentId : items.ids[found]
                return Option.some({
                  // `:not(*)` matches nothing: no match and nothing current
                  // moves no focus, but the key is still recorded.
                  focusSelector:
                    target === null || target === undefined ? ':not(*)' : idSelector(target),
                  message: wrap(key),
                })
              }),
            ]
          },
        }),
        // Keyed by a value the caller chose; `forSlots` checks the key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'Typeahead' },
    )
  }
