/**
 * The running example of `docs/authoring-components.md`: a row of filter chips
 * assembled in an application from primitives. The application's Model owns
 * the chips; `ListNavigation` owns which chip the arrows are on, `Selection`
 * which are picked, and a `Presence` per chip the exit of a removed one. The
 * view is a multiselectable listbox conformed to its pattern, with the keys a
 * page adds through `routes` and a recipe with a size and a look axis. The
 * guide's snippets are reduced from this file; its tests are the
 * `authoringGuide.*.test.ts` beside it.
 */
import { Array, Match, Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import * as Update from 'foldkit/update'
import { Bundle, Link } from 'foldkit-bundle'
import {
  A11y,
  Attr,
  Behavior,
  Behaviors,
  Capability,
  Event,
  Layers,
  Slot,
  Slots,
  SlotView,
  Style,
  type NamedStyle,
  type StyleValue,
} from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { FocusRecovery, ListNavigation, Presence, Selection } from 'foldkit-primitives/interaction'
import { PresenceMessage } from 'foldkit-primitives/motion'

const { Keys } = Behaviors

// State ----------------------------------------------------------------------

export const Chip = Schema.Struct({ id: Schema.String, label: Schema.String })
export type Chip = typeof Chip.Type

export const Nav = Bundle.declare(ListNavigation.bundle, 'nav')
export const Picks = Bundle.declare(Selection.bundle, 'picks')
export const GotPresence = Link.keyedWrapper('GotPresence', PresenceMessage)

export const navArgs = {
  orientation: 'horizontal',
  loop: true,
  virtual: false,
  timeoutMs: 500,
  page: 5,
} as const
export const pickArgs = { mode: 'multiple', allowEmpty: true } as const
export const EXIT_MS = 150

export const Model = Schema.Struct({
  ...Nav.fields,
  ...Picks.fields,
  id: Schema.String,
  chips: Schema.Array(Chip),
  presence: Schema.Record(Schema.String, Presence.bundle.Model),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Nav.cases,
  ...Picks.cases,
  ...GotPresence.cases,
  Removed: { id: Schema.String },
  RemovedPicked: {},
})
export type Message = typeof Message.Type

/** A chip's element id: the instance's, then the chip's, so two filters on a page share none. */
export const chipId = (model: Pick<Model, 'id'>, chip: Chip): string => `${model.id}-${chip.id}`

/** A chip's phase; a chip drawn with no placement is a defect, not a phase to guess. */
export const phaseOf = (model: Pick<Model, 'presence'>, id: string): Presence.Phase => {
  const placed = Object.hasOwn(model.presence, id) ? model.presence[id] : undefined
  if (placed === undefined) throw new Error(`chip ${id} is drawn with no Presence placed`)
  return placed.phase
}

const Parent = Bundle.parent({ Model, Message })
const Picked = Parent.at(Picks, { args: pickArgs })

const Exits = Presence.bundle.each(Link.collection<Model>()('presence', GotPresence), {
  args: { durationMs: EXIT_MS },
  // A chip is taken out when its exit has run, and out of the selection with it.
  onMessage: (_message: PresenceMessage, id: string) => (model: Model) =>
    phaseOf(model, id) === 'hidden'
      ? Picked.helpers.replace(model.picks.selected.filter(each => each !== id))(
          modifyFields(model, {
            chips: chips => chips.filter(chip => chipId(model, chip) !== id),
            presence: presence =>
              Object.fromEntries(Object.entries(presence).filter(([key]) => key !== id)),
          }),
        )
      : { model },
})

export const assembly = Bundle.assemble<Model, Message>()([
  Parent.at(Nav, { args: navArgs }),
  Picked,
  Exits,
])

export const initialOf = (id: string, chips: ReadonlyArray<Chip>) =>
  assembly.initial({
    id,
    chips,
    presence: Object.fromEntries(
      chips.map(chip => [chipId({ id }, chip), { phase: 'shown', generation: 0 } as const]),
    ),
  })

/** Hides each shown chip of `ids`; a chip already leaving is left to its exit. */
const hideAll = (model: Model, ids: ReadonlyArray<string>) =>
  Update.combine(
    model,
    ids
      .filter(id => Object.hasOwn(model.presence, id) && phaseOf(model, id) === 'shown')
      .map(id => Exits.helpers.hide(id)),
  )

export const update = assembly.update((model, message) =>
  Match.valueTags(message, {
    Removed: ({ id }) => hideAll(model, [id]),
    RemovedPicked: () => hideAll(model, model.picks.selected),
  }),
)

// Contract -------------------------------------------------------------------

export const ChipSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Container, events: [Event.KeyDown] }),
  chip: Slot.make({
    capability: Capability.Focusable,
    events: [Event.KeyDown],
    attributes: [Attr.AriaSelected],
  }),
  remove: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})

/** What a multiselectable listbox owes, slot by slot. */
export const ChipPattern = A11y.pattern({
  list: { capability: Capability.Container, obligations: [A11y.Navigation, A11y.Name] },
  chip: {
    capability: Capability.Focusable,
    obligations: [A11y.FocusStrategy, A11y.Activation, A11y.State(Attr.AriaSelected)],
  },
})

// Look -----------------------------------------------------------------------

const t = Theme.ref(Theme.standard())
const base = (...pieces: ReadonlyArray<StyleValue>) =>
  Layers.standard.in('components', Style.compose(...pieces))
const pick = (...pieces: ReadonlyArray<StyleValue>) =>
  Layers.standard.in('variants', Style.compose(...pieces))

/** The picked look, written beside each look that sets the same properties, so it wins in that layer. */
const picked = Style.states(
  {
    true: {
      backgroundColor: t.accent.default,
      borderColor: t.accent.default,
      color: t.accent['on-fill'],
    },
  },
  'aria-selected',
)

export const ChipRecipe = Style.recipeFor(ChipSlots)({
  base: {
    root: base(Style.self({ display: 'grid', gap: t.space.xs, justifyItems: 'start' })),
    list: base(
      Style.self({
        display: 'flex',
        flexWrap: 'wrap',
        gap: t.space.xs,
        margin: '0',
        padding: '0',
        listStyle: 'none',
      }),
    ),
    chip: base(
      Style.self({
        borderRadius: t.radius.full,
        borderWidth: t.border.thin,
        borderStyle: 'solid',
        cursor: 'pointer',
        userSelect: 'none',
        transitionProperty: 'opacity',
        transitionDuration: t.motion.fast,
      }),
      Style.pseudo(':focus-visible', {
        outline: `${t.border.thick} solid ${t.outline.focus}`,
        outlineOffset: '2px',
      }),
      Style.pseudo('[data-presence="hiding"]', { opacity: '0' }),
    ),
  },
  variants: {
    size: {
      sm: { chip: pick(Style.self({ paddingBlock: t.space['3xs'], paddingInline: t.space.xs })) },
      md: { chip: pick(Style.self({ paddingBlock: t.space['2xs'], paddingInline: t.space.sm })) },
    },
    look: {
      outline: {
        chip: pick(
          Style.self({
            backgroundColor: 'transparent',
            borderColor: t.outline.default,
            color: t.text.default,
          }),
          picked,
        ),
      },
      soft: {
        chip: pick(
          Style.self({
            backgroundColor: t.state.tint,
            borderColor: 'transparent',
            color: t.text.default,
          }),
          picked,
        ),
      },
    },
  },
  defaults: { size: 'md', look: 'outline' },
})

export const ChipStyle = Style.forSlots(ChipSlots)(ChipRecipe(), { name: 'ChipStyle' })

// View -----------------------------------------------------------------------

const Filter = SlotView.over(ChipSlots)<Model, Message>()

const chipsByModel = new WeakMap<Model, Behaviors.Collection.Items<Chip>>()

/** The chips as one Collection, built once per Model: every chip a Behavior draws asks for it. */
export const itemsOf = (model: Model): Behaviors.Collection.Items<Chip> => {
  const known = chipsByModel.get(model)
  if (known !== undefined) return known
  const items = Behaviors.Collection.of(model.chips, {
    id: chip => chipId(model, chip),
    disabled: chip => phaseOf(model, chipId(model, chip)) !== 'shown',
  })
  chipsByModel.set(model, items)
  return items
}

/** A key the page answers on a chip, beside Space, Enter, Delete and Backspace. */
export type Route = Behaviors.Keys.Route<Model, Message>

const toggles = Keys.route<Model, Message>('Toggle', {
  on: [Keys.chord('Enter'), Keys.chord(' ')],
  handle: ({ key, input, item }) =>
    // Space mid-word belongs to the typeahead.
    item?.id === undefined || (key === ' ' && input.nav.query !== '')
      ? Option.none()
      : Option.some(Picks.wrapper.make(Selection.Message.Activated({ id: item.id }))),
})

const removes = Keys.route<Model, Message>('Remove', {
  on: [Keys.chord('Delete'), Keys.chord('Backspace')],
  handle: ({ item }) =>
    item?.id === undefined ? Option.none() : Option.some(Message.Removed({ id: item.id })),
})

/** The arrows, Home, End and type to find on the list; a roving tab stop on the chips. */
const Navigates = ListNavigation.behavior(Nav, navArgs)(Filter)({
  container: 'list',
  item: 'chip',
  items: itemsOf,
  text: (model, index) => model.chips[index]?.label ?? '',
})

/** `aria-selected` on each chip, `aria-multiselectable` on the list, and a click that picks. */
const Picking = Selection.behavior(Picks, pickArgs)(Filter)({
  container: 'list',
  item: 'chip',
  items: itemsOf,
})

/** Each chip's id, from the same Collection the keys and the picks read. */
const Ids = Behaviors.Collection.behavior(Filter)({ item: 'chip', items: itemsOf })

/** One owner of a chip's `keydown`: the filter's own routes, then the page's. */
export const chipKeys = (routes: ReadonlyArray<Route> = []) =>
  Keys.behavior(Filter)({ slot: 'chip', name: 'ChipKeys', routes: [toggles, removes, ...routes] })

/** A leaving chip is drawn `inert` and marked for its fade. */
const Leaves = Presence.behavior(Filter)({
  content: 'chip',
  phase: (model, item) => phaseOf(model, item?.id ?? ''),
})

/** Where focus goes when the chip or the button holding it goes. */
const Recovers = FocusRecovery.behavior(Filter)({
  owner: 'root',
  parts: { chip: ['next', 'previous'], remove: ['stop'] },
})

/** The markup alone: no keys, no picks, no look. */
export const chipView = (label: string) =>
  Filter.define((model, slots, h) =>
    h.div(slots.root.attrs(), [
      h.ul(
        slots.list.attrs([h.Role('listbox'), h.AriaLabel(label)]),
        model.chips.map((chip, index) =>
          h.li(
            slots.chip.attrs([h.Key(chipId(model, chip)), h.Role('option')], {
              index,
              id: chipId(model, chip),
            }),
            [chip.label],
          ),
        ),
      ),
      ...(model.picks.selected.length === 0
        ? []
        : [
            h.button(slots.remove.attrs([h.Type('button'), h.OnClick(Message.RemovedPicked())]), [
              'Remove picked',
            ]),
          ]),
    ]),
  )

export interface ChipFilterOptions {
  /** The listbox's accessible name. */
  readonly label: string
  /** Keys the page answers on a chip; a route on a gesture the filter takes is `mixins:key-conflict`. */
  readonly routes?: ReadonlyArray<Route>
  /** A style of `ChipSlots`; default `ChipStyle`. */
  readonly style?: NamedStyle<typeof ChipSlots>
}

export const chipFilter = (options: ChipFilterOptions) =>
  chipView(options.label).pipe(
    Behavior.attach(Navigates),
    Behavior.attach(Picking),
    Behavior.attach(chipKeys(options.routes)),
    Behavior.attach(Ids),
    Behavior.attach(Leaves),
    Behavior.attach(Recovers),
    // The list's name is the view's own `aria-label`: its word, as no Behavior states it.
    SlotView.attach(A11y.base({ list: [A11y.Name] })),
    Style.attach(options.style ?? ChipStyle),
    A11y.conform(ChipPattern),
  )

// The page -------------------------------------------------------------------

/** The page's own key: Escape on a chip lets go of every pick. */
export const escapeClears = Keys.route<Model, Message>('ClearPicks', {
  on: [Keys.chord('Escape')],
  handle: ({ input }) =>
    input.picks.selected.length === 0
      ? Option.none()
      : Option.some(Picks.wrapper.make(Selection.Message.Cleared())),
})

export const FilterChips = chipFilter({ label: 'Filters', routes: [escapeClears] })

export const CHIPS: ReadonlyArray<Chip> = [
  { id: 'open', label: 'Open' },
  { id: 'mine', label: 'Mine' },
  { id: 'urgent', label: 'Urgent' },
  { id: 'stale', label: 'Stale' },
]

export const labelsOf = (model: Model): ReadonlyArray<string> =>
  Array.map(model.chips, chip => chip.label)

/** One filter in `container`, whose element ids all start with `id`. */
export const mountFilter = (container: HTMLElement, id: string, chips = CHIPS) =>
  Runtime.embed(
    Runtime.makeElement(
      assembly.complete({
        Model,
        container,
        init: () => initialOf(id, chips),
        update,
        view: (model: Model, h: HtmlBuilder<Message>) => FilterChips(model, h),
        subscriptions: assembly.subscriptions(),
      }),
    ),
  )
