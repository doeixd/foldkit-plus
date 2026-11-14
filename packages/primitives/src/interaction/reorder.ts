/**
 * Moving an item to another place in a list or a tree, by keyboard and by
 * pointer, as one Bundle. Space or Enter on an item picks it up, the arrows
 * walk it through the places it can go, Space or Enter drops it there, and
 * Escape (or focus leaving it) puts it back. The pointer path is
 * `PointerDrag`'s facts, mapped onto the same Messages, so one draft has one
 * owner whichever way it was started.
 *
 * The Bundle holds the draft alone: what is held and where it would land.
 * Nothing moves until the drop, and then only by the parent: the `Moved`
 * out-fact names the item and its place, and the parent's `update` applies it
 * to its own data or refuses it (a tree node dropped inside itself). Every
 * transition is also an out-fact, so the parent can read it out through
 * `LiveAnnounce` with `announcement`.
 */
import { Match, Option, Schema } from 'effect'
import type { Attribute, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import type * as Update from 'foldkit/update'
import { Bundle, type Declared } from 'foldkit-bundle'
import { Behavior, Behaviors, Capability, Event, SlotView, type SlotItem } from 'foldkit-mixins'
import { DragPlace, PointerDrag, type DragFact } from '../dom/pointer-drag.js'
import type { Direction, Orientation } from './roving-tabindex.js'

/**
 * Where an item would land: `before` or `after` the item `id`, or `inside` it
 * (as its last child). The pointer's places are `PointerDrag`'s, unchanged.
 */
export const Place = DragPlace
export type Place = DragPlace

/** How the held item was picked up: a key on it, or a pointer pressed on it and moved. */
export const By = Schema.Literals(['keys', 'pointer'])
export type By = typeof By.Type

export const Model = Schema.Struct({
  /** The item picked up, and how. */
  held: Schema.OptionFromNullOr(Schema.Struct({ id: Schema.String, by: By })),
  /** Where it would land if dropped now; none over no place. */
  over: Schema.OptionFromNullOr(Place),
})
export type Model = typeof Model.Type

export const Step = Schema.Literals(['previous', 'next', 'first', 'last'])
export type Step = typeof Step.Type

export const Message = defineMessageUnion({
  /** An item was picked up; `at` is where a key grab starts, the place it already holds. */
  Grabbed: { id: Schema.String, by: By, at: Schema.OptionFromNullOr(Place) },
  /** The pointer is over a place, or over none. */
  PointedAt: { over: Schema.OptionFromNullOr(Place) },
  /**
   * An arrow, Home or End. It carries the places in order, as the view drew
   * them, and the step is taken from the Model's `over`, so keys faster than
   * a frame each move one place.
   */
  Stepped: { step: Step, places: Schema.Array(Place) },
  /** Space or Enter: drop where the item is over. */
  Dropped: {},
  /** The pointer was let go over this place, tested again at the release. */
  Released: { over: Schema.OptionFromNullOr(Place) },
  /** Escape, or a cancelled pointer. */
  Cancelled: {},
  /** Focus left an item; it puts back a key grab of that item. */
  Left: { id: Schema.String },
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  PickedUp: { id: Schema.String, by: By },
  /** The held item is over another place, or over none. */
  PassedOver: { id: Schema.String, by: By, over: Schema.OptionFromNullOr(Place) },
  /** Dropped on a place: the parent applies the move, or refuses it. */
  Moved: { id: Schema.String, by: By, to: Place },
  /** Cancelled, or dropped over no place: nothing moves. */
  PutBack: { id: Schema.String, by: By },
})
export type OutMessage = typeof OutMessage.Type

type Return = Update.ReturnWithOutMessage<Model, Message, OutMessage>

interface Held {
  readonly id: string
  readonly by: By
}

const idle: Model = { held: Option.none(), over: Option.none() }

const samePlace = (a: Place, b: Place): boolean =>
  a.id === b.id && a.zone === b.zone && a.part === b.part

const sameOver = (a: Option.Option<Place>, b: Option.Option<Place>): boolean =>
  Option.match(a, {
    onNone: () => Option.isNone(b),
    onSome: left =>
      Option.match(b, { onNone: () => false, onSome: right => samePlace(left, right) }),
  })

/** The index a step lands on in `count` places, from `at` (-1 when the item is over none of them). */
const stepped = (at: number, count: number, step: Step): number => {
  switch (step) {
    case 'first':
      return 0
    case 'last':
      return count - 1
    case 'next':
      return at === -1 ? 0 : Math.min(at + 1, count - 1)
    case 'previous':
      return at === -1 ? count - 1 : Math.max(at - 1, 0)
  }
}

const update = (model: Model, message: Message): Return => {
  const holding = (then: (held: Held) => Return): Return =>
    Option.match(model.held, { onNone: () => ({ model }), onSome: then })
  const over = (held: Held, next: Option.Option<Place>) =>
    sameOver(next, model.over)
      ? { model }
      : {
          model: { ...model, over: next },
          outMessage: OutMessage.PassedOver({ ...held, over: next }),
        }
  const finish = (held: Held, at: Option.Option<Place>) =>
    Option.match(at, {
      onNone: (): Return => ({ model: idle, outMessage: OutMessage.PutBack(held) }),
      onSome: (to): Return => ({ model: idle, outMessage: OutMessage.Moved({ ...held, to }) }),
    })
  return Message.match<Return>(message, {
    Grabbed: ({ id, by, at }) =>
      Option.match(model.held, {
        onNone: () => false,
        onSome: held => held.id === id && held.by === by,
      })
        ? { model }
        : {
            model: { held: Option.some({ id, by }), over: at },
            outMessage: OutMessage.PickedUp({ id, by }),
          },
    PointedAt: ({ over: next }) => holding(held => over(held, next)),
    Stepped: ({ step, places }) =>
      holding(held => {
        if (places.length === 0) return { model }
        const at = Option.match(model.over, {
          onNone: () => -1,
          onSome: current => places.findIndex(place => samePlace(place, current)),
        })
        return over(held, Option.fromNullishOr(places[stepped(at, places.length, step)]))
      }),
    Dropped: () => holding(held => finish(held, model.over)),
    Released: ({ over: at }) => holding(held => finish(held, at)),
    Cancelled: () => holding(held => ({ model: idle, outMessage: OutMessage.PutBack(held) })),
    Left: ({ id }) =>
      holding(held =>
        held.id === id && held.by === 'keys'
          ? { model: idle, outMessage: OutMessage.PutBack(held) }
          : { model },
      ),
  })
}

export const bundle = Bundle.make('Reorder', {
  Model,
  Message,
  init: () => ({ model: idle }),
  update,
  /** What a parent decides: `placed.helpers.cancel()` puts back what is held, as when its row was deleted. */
  helpers: {
    cancel: (model: Model) => update(model, Message.Cancelled()),
  },
})

/** The places a held item can go, and the one it already holds. */
export interface Places {
  /** In the order the arrows walk them. */
  readonly places: ReadonlyArray<Place>
  /** The place the item holds now, where a key grab starts; none when no place names it. */
  readonly origin: Option.Option<Place>
}

export interface PlaceOptions<Input> {
  /** The ids in the order they are drawn; for a tree, the rows that show, flat. */
  readonly items: (input: Input) => ReadonlyArray<string>
  /**
   * For a tree drawn flat: a row's parent. The held row's own rows are no
   * place for it, and a branch's end gets a place after its last row.
   */
  readonly parent?: (input: Input, id: string) => Option.Option<string>
  /** Whether an item takes others inside it, such as a folder: it then gets an `inside` place. */
  readonly accepts?: (input: Input, id: string) => boolean
}

const ancestors = function* (
  id: string,
  parent: (id: string) => Option.Option<string>,
): Generator<string> {
  // A cyclic `parent` is a bug in the caller's data; it must not hang a key press.
  const seen = new Set<string>([id])
  for (let at = parent(id); Option.isSome(at) && !seen.has(at.value); at = parent(at.value)) {
    seen.add(at.value)
    yield at.value
  }
}

const within = (
  id: string,
  ancestor: string,
  parent: (id: string) => Option.Option<string>,
): boolean => {
  if (id === ancestor) return true
  for (const above of ancestors(id, parent)) if (above === ancestor) return true
  return false
}

/**
 * Whether a move lands in the moved item's own subtree: on it, or before,
 * after or inside one of its descendants. A pointer can report such a place,
 * and only the parent knows the tree, so its `update` refuses `Moved` when
 * this holds. The keyboard never offers one.
 */
export const movesIntoItself = (options: {
  readonly id: string
  readonly to: Place
  readonly parent: (id: string) => Option.Option<string>
}): boolean => within(options.to.id, options.id, options.parent)

/**
 * The places `held` can go, in walking order. For each row that shows, but
 * the held one and its own rows: `before` it, then `inside` it when it accepts
 * items and shows none of its own; after the last row of a branch, `after` each
 * level that ends there. So a list of n rows offers n places (the gaps around
 * the others), and no two places are the same position.
 */
export const places = (options: {
  readonly items: ReadonlyArray<string>
  readonly held: string
  readonly parent?: (id: string) => Option.Option<string>
  readonly accepts?: (id: string) => boolean
}): Places => {
  const parentOf = options.parent ?? (() => Option.none())
  const accepts = options.accepts ?? (() => false)
  const parentIs = (id: string, of: Option.Option<string>) => {
    const above = parentOf(id)
    return Option.match(of, {
      onNone: () => Option.isNone(above),
      onSome: expected => Option.contains(above, expected),
    })
  }
  const rows = options.items.filter(id => !within(id, options.held, parentOf))
  const found: Array<Place> = []
  rows.forEach((id, index) => {
    const next = Option.fromNullishOr(rows[index + 1])
    found.push({ id, zone: 'before' })
    const opens = Option.match(next, {
      onNone: () => false,
      onSome: q => parentIs(q, Option.some(id)),
    })
    if (accepts(id) && !opens) found.push({ id, zone: 'inside' })
    if (opens) return
    // The levels that end between this row and the next: `after` each, up to the next row's siblings.
    const stop = Option.flatMap(next, parentOf)
    let level: Option.Option<string> = Option.some(id)
    while (Option.isSome(level)) {
      const at = level.value
      if (Option.isSome(next) && parentIs(at, stop)) break
      found.push({ id: at, zone: 'after' })
      level = parentOf(at)
    }
  })
  // Where the held item is: before its next sibling, after its previous one, or inside its parent.
  const heldAt = options.items.indexOf(options.held)
  const home = parentOf(options.held)
  const isSibling = (id: string) => parentIs(id, home)
  const next = options.items.slice(heldAt + 1).find(id => !within(id, options.held, parentOf))
  const previous = options.items.slice(0, Math.max(heldAt, 0)).reverse().find(isSibling)
  const candidates: ReadonlyArray<Place> = [
    ...(next !== undefined && isSibling(next) ? [{ id: next, zone: 'before' as const }] : []),
    ...(previous === undefined ? [] : [{ id: previous, zone: 'after' as const }]),
    ...Option.match(home, { onNone: () => [], onSome: id => [{ id, zone: 'inside' as const }] }),
  ]
  const origin =
    heldAt === -1
      ? Option.none()
      : Option.fromNullishOr(
          candidates.find(candidate => found.some(place => samePlace(place, candidate))),
        )
  return { places: found, origin }
}

/**
 * A flat list's ids with a move applied, or `ids` itself when nothing
 * changes or either id is missing. `inside` in a flat list (the pointer's
 * middle third of a row) is the row's own slot: after it when moving down,
 * before it when moving up.
 */
export const apply = (
  ids: ReadonlyArray<string>,
  moved: { readonly id: string; readonly to: Place },
): ReadonlyArray<string> => {
  const from = ids.indexOf(moved.id)
  const target = ids.indexOf(moved.to.id)
  if (from === -1 || target === -1 || from === target) return ids
  const rest = ids.filter(id => id !== moved.id)
  const at = rest.indexOf(moved.to.id)
  const downward = from < target
  const lands = { before: at, after: at + 1, inside: downward ? at + 1 : at }[moved.to.zone]
  const next = [...rest.slice(0, lands), moved.id, ...rest.slice(lands)]
  return next.every((id, index) => id === ids[index]) ? ids : next
}

/** What an announcement says. `{item}` and `{target}` are filled with the labels. */
export const words = {
  pickedUp: 'Picked up {item}.',
  pickedUpByKeys:
    'Picked up {item}. Use the arrow keys to move it, Space or Enter to drop it, Escape to put it back.',
  before: '{item}: before {target}.',
  inside: '{item}: inside {target}.',
  after: '{item}: after {target}.',
  nowhere: '{item}: over no place.',
  movedBefore: 'Dropped {item} before {target}.',
  movedInside: 'Dropped {item} inside {target}.',
  movedAfter: 'Dropped {item} after {target}.',
  putBack: '{item} put back where it was.',
} as const
export type Words = { readonly [K in keyof typeof words]: string }

const fill = (template: string, item: string, target: string): string =>
  template.replaceAll('{item}', item).replaceAll('{target}', target)

/**
 * The text that reads a transition out, for `LiveAnnounce`'s `announce`:
 * `label` names an item by its id, as the page shows it. A placement's
 * `onOut` calls it on every fact and announces the result.
 */
export const announcement = (
  fact: OutMessage,
  options: { readonly label: (id: string) => string; readonly words?: Partial<Words> },
): string => {
  const said: Words = { ...words, ...options.words }
  const { label } = options
  return OutMessage.match(fact, {
    PickedUp: ({ id, by }) =>
      fill(by === 'keys' ? said.pickedUpByKeys : said.pickedUp, label(id), ''),
    PassedOver: ({ id, over }) =>
      Option.match(over, {
        onNone: () => fill(said.nowhere, label(id), ''),
        onSome: place => fill(said[place.zone], label(id), label(place.id)),
      }),
    Moved: ({ id, to }) =>
      fill(
        { before: said.movedBefore, inside: said.movedInside, after: said.movedAfter }[to.zone],
        label(id),
        label(to.id),
      ),
    PutBack: ({ id }) => fill(said.putBack, label(id), ''),
  })
}

export interface KeyOptions<Input> extends PlaceOptions<Input> {
  /** For a route on a container, beside a roving tab stop: the item focus is on, which a key picks up. */
  readonly current: (input: Input) => Option.Option<string>
  /** Which arrows walk the places: Up and Down (the default), Left and Right, or both. */
  readonly orientation?: Orientation
  /** Default `'ltr'`; under `'rtl'` Left walks forward and Right back. */
  readonly direction?: (input: Input) => Direction
}

const ARROWS: Readonly<Record<Orientation, ReadonlyArray<Behaviors.Keys.NamedKey>>> = {
  vertical: ['ArrowUp', 'ArrowDown'],
  horizontal: ['ArrowLeft', 'ArrowRight'],
  both: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
}

/** The step an arrow, Home or End takes, under an orientation and a direction. */
export const stepOf = (
  key: string,
  orientation: Orientation,
  direction: Direction,
): Option.Option<Step> => {
  if (key === 'Home') return Option.some('first')
  if (key === 'End') return Option.some('last')
  const vertical = orientation !== 'horizontal'
  const horizontal = orientation !== 'vertical'
  const forward = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
  const backward = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
  if ((vertical && key === 'ArrowDown') || (horizontal && key === forward))
    return Option.some('next')
  if ((vertical && key === 'ArrowUp') || (horizontal && key === backward))
    return Option.some('previous')
  return Option.none()
}

const routeOf = <
  Field extends string,
  Input extends { readonly [K in Field]: Model },
  ParentMessage,
>(
  declared: Declared<typeof bundle, Field>,
  options: PlaceOptions<Input> & {
    readonly orientation?: Orientation
    readonly direction?: (input: Input) => Direction
  },
  pressed: (press: Behaviors.Keys.Press<Input>) => Option.Option<string>,
): Behaviors.Keys.Route<Input, ParentMessage> => {
  const wrap = (message: Message): ParentMessage =>
    declared.wrapper.make(message) as unknown as ParentMessage
  const orientation = options.orientation ?? 'vertical'
  const placesOf = (input: Input, held: string) =>
    places({
      items: options.items(input),
      held,
      ...(options.parent === undefined ? {} : { parent: id => options.parent!(input, id) }),
      ...(options.accepts === undefined ? {} : { accepts: id => options.accepts!(input, id) }),
    })
  // What this route answered on a drawing, by its input: keys faster than a
  // frame meet the last drawing, whose Model has not seen the grab or drop
  // before them, so the drawing remembers it.
  const answered = new WeakMap<Input, Option.Option<string>>()
  return Behaviors.Keys.route<Input, ParentMessage>('Reorder', {
    on: [
      Behaviors.Keys.chord(' '),
      Behaviors.Keys.chord('Enter'),
      Behaviors.Keys.chord('Escape'),
      Behaviors.Keys.chord('Home'),
      Behaviors.Keys.chord('End'),
      ...ARROWS[orientation].map(key => Behaviors.Keys.chord(key)),
    ],
    handle: press => {
      const { key, input } = press
      const held = answered.has(input)
        ? answered.get(input)!
        : Option.map(input[declared.field].held, ({ id }) => id)
      return Option.match(held, {
        onNone: () => {
          if (key !== ' ' && key !== 'Enter') return Option.none()
          return Option.map(pressed(press), id => {
            answered.set(input, Option.some(id))
            return wrap(Message.Grabbed({ id, by: 'keys', at: placesOf(input, id).origin }))
          })
        },
        onSome: id => {
          if (key === ' ' || key === 'Enter' || key === 'Escape') {
            answered.set(input, Option.none())
            return Option.some(wrap(key === 'Escape' ? Message.Cancelled() : Message.Dropped()))
          }
          return Option.map(stepOf(key, orientation, options.direction?.(input) ?? 'ltr'), step =>
            wrap(Message.Stepped({ step, places: placesOf(input, id).places })),
          )
        },
      })
    },
  })
}

/**
 * The route for a `Keys.behavior` on a container that already routes keys,
 * such as a list with `ListNavigation`: both take the arrows, so list it as
 * `Keys.first(Reorder.keys(...)(...), ListNavigation.keys(...)(...))`. Before a
 * grab it takes Space and Enter alone, on the item `current` names; while an
 * item is held it takes the arrows, Home, End, Space, Enter and Escape, and
 * focus stays on the held item.
 */
export const keys =
  <Field extends string>(declared: Declared<typeof bundle, Field>) =>
  <Input extends { readonly [K in Field]: Model }, ParentMessage>(
    options: KeyOptions<Input>,
  ): Behaviors.Keys.Route<Input, ParentMessage> =>
    routeOf<Field, Input, ParentMessage>(declared, options, ({ input }) => options.current(input))

/** `handle: Reorder.routed`: the keys are a route in a `Keys.behavior` of the caller's (see `keys`). */
export const routed: unique symbol = Symbol.for('foldkit-primitives.reorder.routed')

export interface BehaviorOptions<Input, Slots> extends PlaceOptions<Input> {
  /** The slot around every item: the pointer path's Mount goes here. */
  readonly container: keyof Slots & string
  /** The slot drawn once per item; it must carry the item's id (`attrs(…, { index, id })`). */
  readonly item: keyof Slots & string
  /**
   * The slot drawn once per item whose keys pick it up and move it: a grip
   * button in the row, or the row itself. `routed` when the container routes
   * keys already (a roving tab stop); list `keys` in that router, and focus
   * leaving the item puts back what it held.
   */
  readonly handle: (keyof Slots & string) | typeof routed
  readonly orientation?: Orientation
  readonly direction?: (input: Input) => Direction
}

const markOf = (field: string) => `data-fk-reorder-${field}`

/**
 * Wires a placed `Reorder` to the slots. The container gets the pointer path
 * (`PointerDrag`, its facts sent as this Bundle's Messages). Each item gets
 * the mark the pointer finds it by, `data-reorder="held"` while it is held,
 * and `data-reorder-over` with the zone while it is the place the held item
 * would land: style the drop line on those. The handle gets the key route
 * and puts a key grab back when focus leaves it.
 *
 * Nothing moves while an item is held, so focus stays where it is. When the
 * parent applies `Moved`, a keyed list moves the element, and the browser
 * drops its focus: give the handle `FocusRecovery`'s `same` step to keep it.
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
      const wrap = (message: Message): ParentMessage =>
        declared.wrapper.make(message) as unknown as ParentMessage
      const mark = markOf(declared.field)
      const idOf = (input: Input, item: SlotItem | undefined): Option.Option<string> =>
        item === undefined
          ? Option.none()
          : Option.fromNullishOr(item.id ?? options.items(input)[item.index])
      type Context = {
        readonly input: Input
        readonly h: HtmlBuilder<ParentMessage>
        readonly item?: SlotItem
      }
      const left = ({ input, h, item }: Context): ReadonlyArray<Attribute<ParentMessage>> =>
        Option.match(idOf(input, item), {
          onNone: () => [],
          onSome: id => [h.OnBlur(wrap(Message.Left({ id })))],
        })
      const itemAttributes = (context: Context): ReadonlyArray<Attribute<ParentMessage>> => {
        const { input, h, item } = context
        const state = input[declared.field]
        return Option.match(idOf(input, item), {
          onNone: () => [],
          onSome: id => [
            h.Attribute(mark, id),
            ...(Option.exists(state.held, held => held.id === id)
              ? [h.DataAttribute('reorder', 'held')]
              : []),
            ...Option.match(state.over, {
              onNone: () => [],
              onSome: over => (over.id === id ? [h.DataAttribute('reorder-over', over.zone)] : []),
            }),
          ],
        })
      }
      const handle = options.handle
      const keydown =
        handle === routed
          ? Option.none()
          : Option.some(
              Behaviors.Keys.attribute<Input, ParentMessage>(
                [
                  routeOf<Field, Input, ParentMessage>(declared, options, ({ input, item }) =>
                    idOf(input, item),
                  ),
                ],
                { slot: handle },
              ),
            )
      const handleAttributes = (context: Context): ReadonlyArray<Attribute<ParentMessage>> =>
        Option.match(keydown, {
          onNone: () => [],
          onSome: attribute => (context.item === undefined ? [] : [attribute(context)]),
        })
      const spec: Record<string, ReturnType<typeof Behavior.slot>> = Object.create(null)
      spec[options.container] = Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () =>
          Mount.mapMessage(PointerDrag({ attribute: mark }), (fact: DragFact) =>
            wrap(fromDrag(fact)),
          ),
      })
      if (handle === routed || handle === options.item) {
        spec[options.item] = Behavior.slot({
          requires: {
            events: handle === routed ? [Event.Blur] : [Event.KeyDown, Event.Blur],
          },
          attributes: context => [
            ...itemAttributes(context),
            ...handleAttributes(context),
            ...left(context),
          ],
        })
      } else {
        spec[options.item] = Behavior.slot({ attributes: itemAttributes })
        spec[handle] = Behavior.slot({
          requires: { events: [Event.KeyDown, Event.Blur] },
          attributes: context => [...handleAttributes(context), ...left(context)],
        })
      }
      return Behavior.forSlots(slots)<Input, ParentMessage>(
        // Keyed by slot names the caller chose; `forSlots` checks each exists.
        spec as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
        { name: 'Reorder' },
      )
    }
  }
  return place
}

/** The pointer's facts as this Bundle's Messages: one draft, whichever way it started. */
const fromDrag = (fact: DragFact): Message =>
  Match.valueTags(fact, {
    DragStarted: ({ id }): Message => Message.Grabbed({ id, by: 'pointer', at: Option.none() }),
    DraggedOver: ({ over }): Message => Message.PointedAt({ over: Option.fromNullishOr(over) }),
    DragDropped: ({ over }): Message => Message.Released({ over: Option.fromNullishOr(over) }),
    DragCancelled: (): Message => Message.Cancelled(),
  })
