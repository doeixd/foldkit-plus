/**
 * Keyboard navigation of a list in one placement: a roving tab stop, type to
 * find, and PageUp and PageDown. One Bundle holds the current item's id and
 * the typeahead query, so a printable key can move the pointer and extend the
 * query in one transition, which two placements cannot do under `virtual`.
 * The resolver allows one owner per event on a slot, so a host that needs
 * both arrows and typeahead takes this, not `RovingTabindex` plus `Typeahead`.
 */
import { Effect, Option, Schema } from 'effect'
import type { HtmlBuilder, KeyboardModifiers } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Bundle, type Declared } from 'foldkit-bundle'
import { Behavior, Behaviors, Capability, type SlotItem } from 'foldkit-mixins'
import * as RovingTabindex from './roving-tabindex.js'
import * as Typeahead from './typeahead.js'
import { clearQuery, perInput } from '../internal.js'

export const Model = Schema.Struct({
  current: Schema.NullOr(Schema.String),
  query: Schema.String,
  generation: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** An item became current: focused, or reached by a key. */
  Focused: { id: Schema.String },
  /** A printable key extended the query; `match` is the item it now picks, if any. */
  Typed: { char: Schema.String, match: Schema.NullOr(Schema.String) },
  Expired: { generation: Schema.Number },
  Cleared: {},
})
export type Message = typeof Message.Type

export const Args = Schema.Struct({
  orientation: RovingTabindex.Orientation,
  loop: Schema.Boolean,
  virtual: Schema.Boolean,
  /** How long the typeahead query survives after the last key. */
  timeoutMs: Schema.Number.pipe(
    Schema.check(Schema.isGreaterThan(0)),
    Schema.check(Schema.isFinite()),
  ),
  /** How many enabled items PageUp and PageDown move. */
  page: Schema.Number.pipe(Schema.check(Schema.isInt()), Schema.check(Schema.isGreaterThan(0))),
})
export type Args = typeof Args.Type

export const bundle = Bundle.make('ListNavigation', {
  Model,
  Message,
  args: Args,
  init: () => ({ model: { current: null, query: '', generation: 0 } }),
  update: (model, message, args) =>
    Message.match<Update.Return<Model, Message>>(message, {
      // Moving focus by key dispatches `Focused`, and the item's `OnFocus` reports it again.
      Focused: ({ id }) =>
        model.current === id ? { model } : { model: { ...model, current: id } },
      Typed: ({ char, match }) => {
        const generation = model.generation + 1
        return {
          model: { current: match ?? model.current, query: model.query + char, generation },
          commands: [
            {
              name: 'ListNavigation.expire',
              args: { generation },
              effect: Effect.as(Effect.sleep(args.timeoutMs), Message.Expired({ generation })),
            },
          ],
        }
      },
      Expired: ({ generation }) =>
        generation === model.generation ? clearQuery(model) : { model },
      Cleared: () => clearQuery(model),
    }),
})

export interface BehaviorOptions<Input, Slots, ParentMessage> {
  readonly container: keyof Slots & string
  /** The slot rendered once per item; must carry the item's id (see `Behaviors.Collection`). */
  readonly item: keyof Slots & string
  readonly items: (input: Input) => Behaviors.Collection.Items<unknown>
  /** The text an item is matched by when typing. */
  readonly text: (input: Input, index: number) => string
  readonly direction?: (input: Input) => RovingTabindex.Direction
  /**
   * Whether a printable key moves the pointer. Off when the container is a
   * text field: letters belong to the field, and arrows still navigate.
   * Defaults to on.
   */
  readonly typeahead?: boolean
  /**
   * Enter on the current item. One handler with the arrows: a second key
   * handler on the same slot would be a second owner of `keydown`.
   */
  readonly commit?: (input: Input, id: string) => ParentMessage
}

/**
 * The key's outcome, before it is turned into an attribute: navigation to an
 * id, a typed character with its match, or nothing.
 */
export type KeyOutcome =
  | { readonly _tag: 'Navigate'; readonly id: string }
  | { readonly _tag: 'Type'; readonly char: string; readonly match: string | null }

export const keyOutcome = (
  items: Behaviors.Collection.Items<unknown>,
  texts: ReadonlyArray<string>,
  state: { readonly current: string | null; readonly query: string },
  key: string,
  modifiers: KeyboardModifiers,
  options: RovingTabindex.MoveOptions,
): KeyOutcome | undefined => {
  const from = state.current === null ? -1 : items.indexOf(state.current)
  const moved = RovingTabindex.move(items.enabled, from, key, modifiers, options)
  const movedId = moved === undefined ? undefined : items.ids[moved]
  if (movedId !== undefined) return { _tag: 'Navigate', id: movedId }
  if (!Typeahead.isPrintable(key, modifiers)) return undefined
  if (key === ' ' && state.query === '') return undefined
  const found = Typeahead.match(texts, items.enabled, state.query + key, from)
  return { _tag: 'Type', char: key, match: found === undefined ? null : (items.ids[found] ?? null) }
}

/**
 * Wires a placed `ListNavigation` to the slots. The container gets one key
 * handler: arrows, Home, End, PageUp and PageDown move by id; a printable key
 * extends the query and moves to its match. Each item gets `tabindex` and
 * `OnFocus` as under `RovingTabindex`. Under `virtual` nothing takes DOM focus
 * and the container carries `aria-activedescendant`.
 */
export const behavior =
  <Field extends string>(declared: Declared<typeof bundle, Field>, args: Args) =>
  <Slots>(slots: Slots) =>
  <Input extends { readonly [K in Field]: Model }, ParentMessage>(
    options: BehaviorOptions<Input, Slots, ParentMessage>,
  ): Behavior.NamedBehavior<Slots, Input, ParentMessage> => {
    const wrap = (message: Message): ParentMessage =>
      declared.wrapper.make(message) as unknown as ParentMessage
    const focused = (id: string): ParentMessage => wrap(Message.Focused({ id }))
    const slice = (input: Input): Model => input[declared.field]
    const itemsOf = perInput(options.items)
    const outcomeMessage = (outcome: KeyOutcome): ParentMessage =>
      outcome._tag === 'Navigate'
        ? focused(outcome.id)
        : wrap(Message.Typed({ char: outcome.char, match: outcome.match }))
    return Behavior.forSlots(slots)<Input, ParentMessage>(
      {
        [options.container]: Behavior.slot({
          requires: { capability: Capability.Interactive },
          attributes: ({
            input,
            h,
          }: {
            readonly input: Input
            readonly h: HtmlBuilder<ParentMessage>
          }) => {
            const items = itemsOf(input)
            const state = slice(input)
            const moveOptions: RovingTabindex.MoveOptions = {
              orientation: args.orientation,
              loop: args.loop,
              direction: options.direction?.(input) ?? 'ltr',
              page: args.page,
            }
            const typeahead = options.typeahead !== false
            // Commit is already a parent message. A key outcome still has to
            // become one, and the focus path needs the id it should move to.
            type Decision =
              | { readonly _tag: 'Commit'; readonly id: string; readonly message: ParentMessage }
              | { readonly _tag: 'Key'; readonly outcome: KeyOutcome }
            const decide = (key: string, modifiers: KeyboardModifiers): Option.Option<Decision> => {
              if (
                key === 'Enter' &&
                options.commit !== undefined &&
                !modifiers.shiftKey &&
                !modifiers.ctrlKey &&
                !modifiers.altKey &&
                !modifiers.metaKey &&
                state.current !== null &&
                items.ids.includes(state.current)
              ) {
                return Option.some({
                  _tag: 'Commit',
                  id: state.current,
                  message: options.commit(input, state.current),
                })
              }
              const result = keyOutcome(
                items,
                // Read on a key, not on every render.
                items.ids.map((_, index) => options.text(input, index)),
                state,
                key,
                modifiers,
                moveOptions,
              )
              // A text field owns printable keys. Arrows still move the pointer.
              if (!typeahead && result !== undefined && result._tag === 'Type') return Option.none()
              if (result === undefined) return Option.none()
              return Option.some({ _tag: 'Key', outcome: result })
            }
            const messageOf = (decision: Decision): ParentMessage => {
              if (decision._tag === 'Commit') return decision.message
              return outcomeMessage(decision.outcome)
            }
            const stop = RovingTabindex.tabStop(items, state.current)
            const stopId = stop === -1 ? undefined : items.ids[stop]
            if (args.virtual) {
              return [
                h.OnKeyDownPreventDefault((key, modifiers) =>
                  Option.map(decide(key, modifiers), messageOf),
                ),
                ...(stopId === undefined ? [] : [h.AriaActiveDescendant(stopId)]),
              ]
            }
            return [
              h.OnKeyDownFocus((key, modifiers) =>
                Option.map(decide(key, modifiers), decision => {
                  if (decision._tag === 'Commit') {
                    return {
                      focusSelector: RovingTabindex.idSelector(decision.id),
                      message: decision.message,
                    }
                  }
                  const result = decision.outcome
                  const target =
                    result._tag === 'Navigate' ? result.id : (result.match ?? state.current)
                  return {
                    // `:not(*)` matches nothing: a typed key with no match and
                    // nothing current moves no focus but is still recorded.
                    focusSelector: target === null ? ':not(*)' : RovingTabindex.idSelector(target),
                    message: outcomeMessage(result),
                  }
                }),
              ),
            ]
          },
        }),
        [options.item]: Behavior.slot({
          requires: { capability: Capability.Focusable },
          attributes: ({
            input,
            h,
            item,
          }: {
            readonly input: Input
            readonly h: HtmlBuilder<ParentMessage>
            readonly item?: SlotItem
          }) =>
            item === undefined
              ? []
              : RovingTabindex.itemAttributes(
                  h,
                  itemsOf(input),
                  slice(input).current,
                  item,
                  args.virtual,
                  focused,
                ),
        }),
        // Keyed by values the caller chose; `forSlots` checks both keys exist.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'ListNavigation' },
    )
  }
