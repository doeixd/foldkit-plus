/**
 * Keyboard navigation of a list in one placement: a roving tab stop, type to
 * find, and PageUp and PageDown. One Bundle holds the current item's id and
 * the typeahead query, so a printable key can move the pointer and extend the
 * query in one transition, which two placements cannot do under `virtual`.
 * The resolver allows one owner per event on a slot, so a host that needs
 * both arrows and typeahead takes this, not `RovingTabindex` plus `Typeahead`.
 */
import { Effect, Match, Option, Schema } from 'effect'
import type { HtmlBuilder, KeyboardModifiers } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Bundle, type Declared } from 'foldkit-bundle'
import { A11y, Behavior, Behaviors, Capability, SlotView, type SlotItem } from 'foldkit-mixins'
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

const update = (model: Model, message: Message, args: Args): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    // Moving focus by key dispatches `Focused`, and the item's `OnFocus` reports it again.
    Focused: ({ id }) => (model.current === id ? { model } : { model: { ...model, current: id } }),
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
    Expired: ({ generation }) => (generation === model.generation ? clearQuery(model) : { model }),
    Cleared: () => clearQuery(model),
  })

export const bundle = Bundle.make('ListNavigation', {
  Model,
  Message,
  args: Args,
  init: () => ({ model: { current: null, query: '', generation: 0 } }),
  update,
  /** What a parent decides: `placed.helpers.focus(id)` makes an item current. */
  helpers: args => ({
    focus: (model: Model, id: string) => update(model, Message.Focused({ id }), args),
  }),
})

export interface KeyOptions<Input, ParentMessage> {
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
   * Enter on the current enabled item. One handler with the arrows: a second
   * key handler on the same slot would be a second owner of `keydown`. Deprecated
   * as a way to commit: list your own `Keys.route` for Enter beside `keys`.
   */
  readonly commit?: (input: Input, id: string) => ParentMessage
}

export interface BehaviorOptions<
  Input,
  Slots,
  ParentMessage,
  Container extends keyof Slots & string = keyof Slots & string,
  Item extends keyof Slots & string = keyof Slots & string,
> extends KeyOptions<Input, ParentMessage> {
  readonly container: Container
  /** The slot rendered once per item; must carry the item's id (see `Behaviors.Collection`). */
  readonly item: Item
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
 * The route a `ListNavigation` installs on its container: arrows, Home, End,
 * PageUp and PageDown move by id; a printable key extends the query and moves
 * to its match (unless `typeahead` is off); Enter commits when `commit` is
 * given. Focus moves to the item answered; under `virtual` the route sends the
 * Message alone. List it in a `Keys.behavior` beside routes of your own, such
 * as one that clears a search field on Escape.
 */
export const keys =
  <Field extends string>(declared: Declared<typeof bundle, Field>, args: Args) =>
  <Input extends { readonly [K in Field]: Model }, ParentMessage>(
    options: KeyOptions<Input, ParentMessage>,
  ): Behaviors.Keys.Route<Input, ParentMessage> => {
    const wrap = (message: Message): ParentMessage =>
      declared.wrapper.make(message) as unknown as ParentMessage
    const itemsOf = perInput(options.items)
    const typeahead = options.typeahead !== false
    type Answer = ParentMessage | Behaviors.Keys.Focus<ParentMessage>
    const answerWith = (id: string | null, message: ParentMessage): Answer =>
      args.virtual || id === null ? message : Behaviors.Keys.focus(id, message)
    return Behaviors.Keys.route<Input, ParentMessage>('ListNavigation', {
      on: [
        ...Behaviors.Keys.withShift('Home'),
        ...Behaviors.Keys.withShift('End'),
        ...Behaviors.Keys.withShift('PageUp'),
        ...Behaviors.Keys.withShift('PageDown'),
        ...RovingTabindex.arrowChords(args.orientation),
        ...(options.commit === undefined ? [] : [Behaviors.Keys.chord('Enter')]),
        ...(typeahead ? [Behaviors.Keys.printable] : []),
      ],
      handle: ({ key, modifiers, input }): Option.Option<Answer> => {
        const items = itemsOf(input)
        const state = input[declared.field]
        const { current } = state
        if (key === 'Enter' && options.commit !== undefined && current !== null) {
          const currentIndex = items.indexOf(current)
          if (currentIndex !== -1 && !items.isDisabled(currentIndex)) {
            return Option.some(answerWith(current, options.commit(input, current)))
          }
        }
        const result = keyOutcome(
          items,
          // Read on a key, not on every render.
          items.ids.map((_, index) => options.text(input, index)),
          state,
          key,
          modifiers,
          {
            orientation: args.orientation,
            loop: args.loop,
            direction: options.direction?.(input) ?? 'ltr',
            page: args.page,
          },
        )
        if (result === undefined) return Option.none()
        const message = Match.valueTags(result, {
          Navigate: ({ id }): Message => Message.Focused({ id }),
          Type: ({ char, match }): Message => Message.Typed({ char, match }),
        })
        const target = Match.valueTags(result, {
          Navigate: ({ id }): string | null => id,
          Type: ({ match }): string | null => match ?? current,
        })
        return Option.some(answerWith(target, wrap(message)))
      },
    })
  }

/**
 * Wires a placed `ListNavigation` to the slots. The container gets the `keys`
 * route as its one key handler. Each item gets `tabindex` and `OnFocus` as
 * under `RovingTabindex`. Under `virtual` nothing takes DOM focus and the
 * container carries `aria-activedescendant`.
 */
export const behavior = <Field extends string>(
  declared: Declared<typeof bundle, Field>,
  args: Args,
) => {
  function place<Slots, Input extends { readonly [K in Field]: Model }, ParentMessage>(
    bound: SlotView.Bound<Slots, Input, ParentMessage>,
  ): <Container extends keyof Slots & string, Item extends keyof Slots & string>(
    options: BehaviorOptions<Input, Slots, ParentMessage, Container, Item>,
  ) => Behavior.NamedBehavior<
    Slots,
    Input,
    ParentMessage,
    A11y.ProvidedOn<Container, 'navigation'> | A11y.ProvidedOn<Item, 'focus-strategy'>
  >
  function place<Slots>(
    slots: SlotView.Unbound<Slots>,
  ): <Input extends { readonly [K in Field]: Model }, ParentMessage>(
    options: BehaviorOptions<Input, Slots, ParentMessage>,
  ) => Behavior.NamedBehavior<Slots, Input, ParentMessage>
  function place<Slots>(given: Slots | SlotView.Bound<Slots, any, any>) {
    const slots = SlotView.boundSlots(given)
    return <Input extends { readonly [K in Field]: Model }, ParentMessage>(
      options: BehaviorOptions<Input, Slots, ParentMessage>,
    ): Behavior.NamedBehavior<Slots, Input, ParentMessage> => {
      const wrap = (message: Message): ParentMessage =>
        declared.wrapper.make(message) as unknown as ParentMessage
      const focused = (id: string): ParentMessage => wrap(Message.Focused({ id }))
      const slice = (input: Input): Model => input[declared.field]
      const itemsOf = perInput(options.items)
      const keydown = Behaviors.Keys.attribute<Input, ParentMessage>(
        [keys<Field>(declared, args)<Input, ParentMessage>(options)],
        { slot: options.container, moveFocus: !args.virtual },
      )
      return Behavior.forSlots(slots)<Input, ParentMessage>(
        {
          [options.container]: Behavior.slot({
            requires: { capability: Capability.Interactive },
            provides: [A11y.Navigation],
            attributes: context => {
              const { input, h } = context
              const items = itemsOf(input)
              const stop = RovingTabindex.tabStop(items, slice(input).current)
              const stopId = stop === -1 ? undefined : items.ids[stop]
              return [
                keydown(context),
                ...(args.virtual && stopId !== undefined ? [h.AriaActiveDescendant(stopId)] : []),
              ]
            },
          }),
          [options.item]: Behavior.slot({
            requires: { capability: Capability.Focusable },
            provides: [A11y.FocusStrategy],
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
  }
  return place
}
